const HOMESERVER = "https://matrix2.bestar.de5.net";
const form = document.getElementById('form');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const submitLabel = submitBtn.querySelector('.btn-label');

function setLoading(isLoading) {
  form.classList.toggle('is-loading', isLoading);
  submitBtn.disabled = isLoading;
  submitBtn.setAttribute('aria-busy', String(isLoading));
  submitLabel.textContent = isLoading ? '注册中...' : '注册';
}

form.onsubmit = async (event) => {
  event.preventDefault();
  msg.style.display = 'none';
  msg.className = 'msg';
  msg.textContent = '请稍候，正在向服务器提交注册请求...';
  setLoading(true);

  try {
    const r1 = await fetch(`${HOMESERVER}/_matrix/client/r0/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth: {}, username: form.username.value })
    });
    const d1 = await r1.json();
    const session = d1.session;
    if (!session) throw new Error(d1.errcode || JSON.stringify(d1));

    const r2 = await fetch(`${HOMESERVER}/_matrix/client/r0/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: {
          type: 'm.login.registration_token',
          session: session,
          token: form.token.value
        },
        username: form.username.value,
        password: form.password.value,
        bind_email: !!form.email.value
      })
    });
    const d2 = await r2.json();
    if (d2.access_token) {
      msg.className = 'msg success';
      msg.textContent = '✅ 注册成功！请用 Element 等客户端连接 matrix2.bestar.de5.net 登录。';
      form.reset();
    }
    else {
      throw new Error(d2.errcode + ': ' + d2.error);
    }
  }
  catch (err) {
    msg.className = 'msg error';
    msg.textContent = '❌ 注册失败：' + err.message;
  }
  finally {
    setLoading(false);
  }
};