// ProfileStore — накопительный профиль пациента (4 слоя, версионирование).
// Спецификация: workspace/projects/health-diary/profile-spec.md
//
// Архитектура: адаптер поверх хранилища. Сейчас localStorage, потом backend —
// верхний слой кода (Assistant, Orchestrator, UI) не меняется.
//
// Каждое поле в Слоях 1-2 — массив версий: [{value, date, source, confidence}].
// Текущее значение = последняя запись. История доступна через getHistory().

const ProfileStore = {
  KEY: 'hd_profile_v2',
  SCHEMA_VERSION: 2,

  _emptyProfile() {
    return {
      version: this.SCHEMA_VERSION,
      patientId: null,
      layers: {
        anketa: {
          name: [], sex: [], age: [], height: [], weight: [],
          chronic: [], allergies: [], medications: [],
          bad_habits: [],
          heredity: [], diagnosis: [],
          region: [], native_language: [],
          glucometer: []
        },
        patterns: {
          breakfast: [], lunch: [], dinner: [], snacks: [],
          training: [], sleep: [], work_mode: [],
          stress_triggers: [], alcohol: [], caffeine: [],
          personal_notes: []
        },
        reactions: {
          peak_after_meal: [], curve_shape: [], carb_sensitivity: [],
          activity_response: [], sleep_response: [],
          reactive_hypoglycemia: [], individual_triggers: [],
          last_cgm_calibration: []
        },
        journal: {
          dialogue_patterns: [], emotional_triggers: [],
          marker_phrases: [], resistance_history: [],
          success_history: [], unspoken_observations: []
        }
      },
      meta: {
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        schema_version: this.SCHEMA_VERSION
      }
    };
  },

  _load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[ProfileStore] load error:', e);
      return null;
    }
  },

  _save(profile) {
    profile.meta.last_updated = new Date().toISOString();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(profile));
      return true;
    } catch (e) {
      console.warn('[ProfileStore] save error:', e);
      return false;
    }
  },

  get(layer, field) {
    const p = this._load();
    if (!p || !p.layers[layer] || !p.layers[layer][field]) return null;
    const arr = p.layers[layer][field];
    if (!arr.length) return null;
    return arr[arr.length - 1].value;
  },

  getHistory(layer, field) {
    const p = this._load();
    if (!p || !p.layers[layer]) return [];
    return p.layers[layer][field] || [];
  },

  // source: 'patient_input' | 'llm_extracted' | 'cgm' | 'manual_review'
  // confidence: 'single_mention' | 'confirmed_by_patient' | 'calibrated'
  set(layer, field, value, source, confidence) {
    let p = this._load();
    if (!p) p = this._emptyProfile();
    if (!p.layers[layer]) p.layers[layer] = {};
    if (!Array.isArray(p.layers[layer][field])) p.layers[layer][field] = [];
    p.layers[layer][field].push({
      value,
      date: new Date().toISOString(),
      source: source || 'patient_input',
      confidence: confidence || 'confirmed_by_patient'
    });
    return this._save(p);
  },

  getAll() {
    return this._load() || this._emptyProfile();
  },

  migrateFromLegacy(legacy) {
    if (!legacy || typeof legacy !== 'object') return null;
    if (this._load()) return this._load();

    const p = this._emptyProfile();
    const now = new Date().toISOString();
    const push = (layer, field, value) => {
      if (value === undefined || value === null || value === '') return;
      p.layers[layer][field].push({
        value, date: now, source: 'patient_input', confidence: 'confirmed_by_patient'
      });
    };
    push('anketa', 'sex', legacy.sex);
    push('anketa', 'age', legacy.age);
    push('anketa', 'height', legacy.height);
    push('anketa', 'weight', legacy.weight);
    if (legacy.prediabetes) {
      push('anketa', 'diagnosis', { name: 'преддиабет', stage: legacy.prediabetes_stage || null });
    }
    if (Array.isArray(legacy.chronic) && legacy.chronic.length) {
      legacy.chronic.forEach(c => push('anketa', 'chronic', c));
    } else if (typeof legacy.chronic === 'string' && legacy.chronic) {
      push('anketa', 'chronic', legacy.chronic);
    }
    if (Array.isArray(legacy.allergies) && legacy.allergies.length) {
      legacy.allergies.forEach(a => push('anketa', 'allergies', a));
    }
    if (legacy.sleepHours) {
      push('patterns', 'sleep', { typical_duration_hours: legacy.sleepHours });
    }
    if (legacy.activity) {
      push('patterns', 'training', { level: legacy.activity });
    }
    if (legacy.mealPattern) {
      push('patterns', 'personal_notes', { kind: 'meal_pattern_raw', text: legacy.mealPattern });
    }
    this._save(p);
    return p;
  }
};

if (typeof window !== 'undefined') window.ProfileStore = ProfileStore;
