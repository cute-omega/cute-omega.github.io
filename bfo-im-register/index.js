const HOMESERVER = "https://matrix2.bestar.de5.net";
const form = document.getElementById('form');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const submitLabel = submitBtn.querySelector('.btn-label');

function showError(message) {
  const text = message instanceof Error ? message.message : String(message);
  alert(text);
  msg.className = 'msg error';
  msg.textContent = '❌ ' + text;
  msg.style.display = 'block';
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  }
  catch {
    return { raw: text };
  }
}

window.addEventListener('error', (event) => {
  showError(event.error || event.message || '发生未知错误');
});

window.addEventListener('unhandledrejection', (event) => {
  showError(event.reason || '发生未处理的异步错误');
});

function validateForm() {
  const username = form.username.value.trim();
  const password = form.password.value;
  const email = form.email.value.trim();
  const token = form.token.value.trim();

  if (!username) return '请输入用户名。';
  if (!/^[a-z0-9_-]+$/.test(username)) return '用户名只能包含小写字母、数字、下划线和连字符。';
  if (username.length < 2 || username.length > 30) return '用户名长度必须在 2 到 30 个字符之间。';
  if (!password) return '请输入密码。';
  if (password.length < 8) return '密码至少需要 8 位。';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确。';
  if (!token) return '请输入邀请码。';
  if (token.length > 64) return '邀请码长度不能超过 64 个字符。';

  return '';
}

function setLoading(isLoading) {
  form.classList.toggle('is-loading', isLoading);
  submitBtn.disabled = isLoading;
  submitBtn.setAttribute('aria-busy', String(isLoading));
  submitLabel.textContent = isLoading ? '注册中...' : '注册';
}

form.onsubmit = async (event) => {
  event.preventDefault();

  const validationError = validateForm();
  if (validationError) {
    showError(validationError);
    return;
  }

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
    const d1 = await readResponseBody(r1);
    const session = d1.session;
    if (!session) {
      throw new Error(d1.error || d1.errcode || d1.raw || `首次注册请求失败：HTTP ${r1.status}`);
    }

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
    const d2 = await readResponseBody(r2);
    if (!r2.ok) {
      throw new Error(d2.error || d2.errcode || d2.raw || `第二次注册请求失败：HTTP ${r2.status}`);
    }
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
    showError('注册失败：' + (err instanceof Error ? err.message : String(err)));
  }
  finally {
    setLoading(false);
  }
};