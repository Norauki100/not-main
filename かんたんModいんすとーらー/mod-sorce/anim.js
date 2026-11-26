(function () {
  const css = `
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes enter{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
@keyframes leave{to{opacity:0;transform:translateX(16px)}}
@keyframes spin{to{transform:rotate(360deg)}}
.rise{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.enter{animation:enter .3s ease-out both}
.leave{animation:leave .22s ease-in forwards}
button{transition:transform .12s,background .15s,opacity .15s}
button:hover:not(:disabled){transform:translateY(-1px)}
button:active:not(:disabled){transform:scale(.96)}
button.busy{position:relative;color:transparent!important}
button.busy::after{content:"";position:absolute;inset:0;margin:auto;width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
#overlay,#settings{display:grid;place-items:center;padding:16px;background:rgba(20,28,24,0);transition:background .2s}
#overlay[hidden],#settings[hidden]{display:none}
#overlay.show,#settings.show{background:rgba(20,28,24,.45)}
#panel,#settingsPanel{opacity:0;transform:translateY(18px) scale(.97);transition:opacity .22s,transform .22s cubic-bezier(.2,.7,.2,1)}
#overlay.show #panel,#settings.show #settingsPanel{opacity:1;transform:none}
.gallery img{transition:transform .2s}
.gallery img:hover{transform:scale(1.04)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  // 一覧に項目が追加されたら、順番に少しずつ出す
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1 || !n.matches('li, #log div, #bulkLog div')) return;
    const i = [...n.parentNode.children].indexOf(n);
    n.style.animationDelay = Math.min(i, 12) * 45 + 'ms';
    n.classList.add('enter');
  }))).observe(document.body, { childList: true, subtree: true });

  // 起動時に各セクションを順に表示
  document.querySelectorAll('main > *').forEach((e, i) => { e.style.animationDelay = i * 70 + 'ms'; e.classList.add('rise'); });

  window.Anim = {
    remove(el, done) { el.classList.remove('enter'); el.classList.add('leave'); setTimeout(done, 200); },
    open(ov) { ov.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show'))); },
    close(ov) { ov.classList.remove('show'); setTimeout(() => { ov.hidden = true; }, 220); },
    busy(b, on) { b.classList.toggle('busy', on); }
  };
})();
