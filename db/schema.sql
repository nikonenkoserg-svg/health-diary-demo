-- Health Diary — schema v1
-- Запустить в Supabase Dashboard → SQL Editor → Run

-- Пациенты (минимум — UUID; для пилота без email/пароля)
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  country text default 'BR',
  language text default 'ru',
  last_seen_at timestamptz default now()
);

-- Профиль (анкета)
create table if not exists profiles (
  patient_id uuid primary key references patients(id) on delete cascade,
  sex text,
  age int,
  weight_kg numeric,
  height_cm numeric,
  bmi numeric,
  diagnosis text,
  meds text,
  allergies text,
  activity_level text,
  sleep_hours numeric,
  raw jsonb,
  updated_at timestamptz default now()
);

-- Сообщения чата
create table if not exists messages (
  id bigserial primary key,
  patient_id uuid references patients(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz default now()
);
create index if not exists idx_messages_patient_time on messages(patient_id, created_at desc);

-- Замеры глюкозы
create table if not exists glucose_log (
  id bigserial primary key,
  patient_id uuid references patients(id) on delete cascade,
  value numeric not null,
  type text default 'random' check (type in ('fasting','postprandial','preprandial','bedtime','random')),
  source text default 'manual' check (source in ('manual','libre','dexcom','imported')),
  measured_at timestamptz not null,
  created_at timestamptz default now()
);
create index if not exists idx_glucose_patient_time on glucose_log(patient_id, measured_at desc);

-- Еда (логирование с расчётной кривой)
create table if not exists food_log (
  id bigserial primary key,
  patient_id uuid references patients(id) on delete cascade,
  foods text not null,
  eaten_at timestamptz not null,
  estimated_peak numeric,
  estimated_peak_time int,
  created_at timestamptz default now()
);
create index if not exists idx_food_patient_time on food_log(patient_id, eaten_at desc);

-- События дня (сон, тренировка, стресс)
create table if not exists events (
  id bigserial primary key,
  patient_id uuid references patients(id) on delete cascade,
  kind text not null check (kind in ('sleep','exercise','stress','medication','other')),
  description text,
  happened_at timestamptz not null,
  duration_min int,
  created_at timestamptz default now()
);
create index if not exists idx_events_patient_time on events(patient_id, happened_at desc);

-- RLS пока выключим для пилота — все запросы идут через сервер с service key
-- Включим когда будет real auth
