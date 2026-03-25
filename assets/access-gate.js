(function(){
  const ACCESS_CODE = 'yak2026';
  const KEY = 'yak-access';
  if (localStorage.getItem(KEY) === 'granted') return;
  const style = document.createElement('style');
  style.textContent = `body.access-locked{overflow:hidden} .gate-overlay{position:fixed;inset:0;background:#fff;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:'SUIT','Apple SD Gothic Neo','Malgun Gothic',sans-serif;} .gate-card{width:min(360px,90vw);border:1px solid #e5e8f2;border-radius:24px;padding:28px;text-align:center;box-shadow:0 20px 45px rgba(0,0,0,0.12);} .gate-card h2{margin:0 0 8px;font-size:22px;color:#1f2340;} .gate-card p{margin:0;color:#6b7280;font-size:14px;} .gate-card input{width:100%;padding:12px;margin:18px 0;border-radius:14px;border:1px solid #e5e8f2;font-size:15px;} .gate-card button{width:100%;padding:12px;border:none;border-radius:14px;background:#4c5bf7;color:#fff;font-weight:600;cursor:pointer;} .gate-error{color:#ff4d6d;font-size:13px;height:18px;margin-top:6px;}`;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.className = 'gate-overlay';
  overlay.innerHTML = `
    <div class="gate-card">
      <h2>비공개 데모</h2>
      <p>접근 코드를 입력해주세요.</p>
      <input id="gate-input" type="password" placeholder="Access Code" />
      <button id="gate-btn">입장하기</button>
      <div class="gate-error" id="gate-error"></div>
    </div>`;
  document.body.classList.add('access-locked');
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#gate-input');
  const error = overlay.querySelector('#gate-error');
  overlay.querySelector('#gate-btn').addEventListener('click', () => {
    if (input.value.trim().toLowerCase() === ACCESS_CODE) {
      overlay.remove();
      document.body.classList.remove('access-locked');
      localStorage.setItem(KEY, 'granted');
    } else {
      error.textContent = '코드가 올바르지 않습니다.';
    }
  });
})();
