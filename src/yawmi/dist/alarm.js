'use strict';
(() => {
  function createAlarm(audio, onChange = () => {}, onError = () => {}) {
    let ringing = false;
    let generation = 0;
    return {
      get ringing() { return ringing; },
      async start() {
        if (ringing) return;
        ringing = true;
        const attempt = ++generation;
        audio.loop = true;
        audio.volume = 0.65;
        audio.currentTime = 0;
        onChange(true);
        try {
          await audio.play();
          // A slow play() must not restart a dismissed alarm.
          if (!ringing && attempt !== generation) { audio.pause(); audio.currentTime = 0; }
        } catch (error) {
          if (ringing && attempt === generation) onError(error);
        }
      },
      stop() {
        ringing = false;
        generation++;
        audio.pause();
        audio.currentTime = 0;
        onChange(false);
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { createAlarm }; return; }
  const dialog = document.getElementById('alarm-dialog');
  const audio = document.getElementById('alarm-audio');
  const retry = document.getElementById('retry-alarm');
  const hint = document.getElementById('alarm-hint');
  const testButton = document.createElement('button');
  testButton.id = 'test-alarm';
  testButton.type = 'button';
  testButton.className = 'secondary test-alarm';
  testButton.textContent = '♫ جرّب صوت المنبّه';
  document.querySelector('.settings-extra').prepend(testButton);
  const controller = createAlarm(audio, ringing => {
    if (ringing) {
      retry.hidden = true;
      hint.textContent = 'المنبّه هيفضل يرن لحد ما تضغط إيقاف.';
      if (!dialog.open) dialog.showModal();
      document.getElementById('stop-alarm').focus();
    } else if (dialog.open) dialog.close();
  }, error => {
    console.error('Alarm playback failed:', error?.name, error?.message, audio.error?.code, audio.error?.message);
    hint.textContent = 'تعذّر تشغيل الصوت. اضغط تشغيل الصوت للمحاولة تاني.';
    retry.hidden = false;
  });
  document.getElementById('stop-alarm').onclick = () => controller.stop();
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('close', () => { if (controller.ringing) controller.stop(); });
  retry.onclick = () => { controller.stop(); controller.start(); };
  document.getElementById('test-alarm').onclick = () => {
    document.getElementById('alarm-message').textContent = 'دي تجربة صوت المنبّه. اضغط إيقاف لما تحب.';
    controller.start();
  };
  window.yawmiAlarm = Object.freeze({
    start(message) { document.getElementById('alarm-message').textContent = message; return controller.start(); },
    stop() { controller.stop(); },
    get ringing() { return controller.ringing; }
  });
})();
