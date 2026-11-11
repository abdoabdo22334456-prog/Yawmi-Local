'use strict';
(() => {
  function createAlarm(audio, onChange = () => {}, onError = () => {}) {
    let ringing = false, generation = 0;
    return {
      get ringing() { return ringing; },
      async start() {
        if (ringing) return;
        ringing = true;
        const attempt = ++generation;
        audio.loop = true; audio.volume = 0.65; audio.currentTime = 0;
        onChange(true);
        try {
          await audio.play();
          // A slow play() must not restart a dismissed alarm.
          if (!ringing && attempt !== generation) { audio.pause(); audio.currentTime = 0; }
        } catch (error) { if (ringing && attempt === generation) onError(error); }
      },
      stop() { ringing = false; generation++; audio.pause(); audio.currentTime = 0; onChange(false); }
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { createAlarm }; return; }
  const t = window.yawmiI18n.t, $ = id => document.getElementById(id);
  const dialog = $('alarm-dialog'), audio = $('alarm-audio'), retry = $('retry-alarm'), hint = $('alarm-hint');
  const controller = createAlarm(audio, ringing => {
    if (ringing) {
      retry.hidden = true; hint.textContent = t('alarm.hint');
      if (!dialog.open) dialog.showModal();
      $('stop-alarm').focus();
    } else if (dialog.open) dialog.close();
  }, error => {
    console.error('Alarm playback failed:', error?.name, error?.message);
    hint.textContent = t('alarm.retryHint'); retry.hidden = false;
  });
  $('stop-alarm').onclick = () => controller.stop();
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('close', () => { if (controller.ringing) controller.stop(); });
  retry.onclick = () => { controller.stop(); controller.start(); };
  window.yawmiAlarm = Object.freeze({
    start(message) { $('alarm-message').textContent = message; return controller.start(); },
    stop() { controller.stop(); },
    get ringing() { return controller.ringing; }
  });
})();
