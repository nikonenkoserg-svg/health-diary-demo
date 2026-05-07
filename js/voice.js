// Voice input via Deepgram

const Voice = {
  mediaRecorder: null,
  chunks: [],
  isRecording: false,

  getMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
  },

  async toggle() {
    if (this.isRecording) {
      this.mediaRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.getMimeType();
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        this.isRecording = false;
        const btn = document.getElementById('btnMic');
        btn.classList.remove('recording');
        btn.classList.add('processing');

        try {
          const blob = new Blob(this.chunks, { type: mimeType });
          const resp = await fetch('/api/speech', {
            method: 'POST',
            headers: {
              'Content-Type': mimeType,
              'X-Language': 'ru'
            },
            body: blob
          });

          if (!resp.ok) throw new Error('Speech API error');
          const data = await resp.json();

          if (data.transcript) {
            const input = document.getElementById('input');
            input.value += (input.value ? ' ' : '') + data.transcript;
            input.dispatchEvent(new Event('input'));
          }
        } catch (err) {
          console.error('Voice error:', err);
        }
        btn.classList.remove('processing');
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      document.getElementById('btnMic').classList.add('recording');
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  }
};
