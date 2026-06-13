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

  if (!username) return '请输入用户名。';
  if (!/^[a-z0-9_-]+$/.test(username)) return '用户名只能包含小写字母、数字、下划线和连字符。';
  if (username.length < 2 || username.length > 64) return '用户名长度必须在 2 到 64 个字符之间。';
  if (!password) return '请输入密码。';
  if (password.length < 8 || password.length > 64) return '密码长度必须在 8 到 64 个字符之间。';
  if (!email) return '请输入邮箱。';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确。';

  return '';
}

function makeClientSecret() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (value) => value.toString(16).padStart(2, '0')).join('');
}

function flowIncludesStage(flows, stage) {
  if (!Array.isArray(flows)) return false;
  return flows.some((flow) => Array.isArray(flow.stages) && flow.stages.includes(stage));
}

async function requestEmailToken(email) {
  const clientSecret = makeClientSecret();
  const sendAttempt = Math.floor(Date.now() / 1000);
  const response = await fetch(`${HOMESERVER}/_matrix/client/v3/register/email/requestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_secret: clientSecret,
      email,
      send_attempt: sendAttempt
    })
  });
  const data = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(data.error || data.errcode || data.raw || `邮件验证请求失败：HTTP ${response.status}`);
  }
  if (!data.sid) {
    throw new Error('服务器未返回 sid，无法继续邮箱验证流程。');
  }
  return { sid: data.sid, clientSecret };
}

async function completeRegistration(payload) {
  const response = await fetch(`${HOMESERVER}/_matrix/client/v3/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await readResponseBody(response);
  return { response, data };
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
    const username = form.username.value.trim();
    const password = form.password.value;
    const email = form.email.value.trim();

    const { response: r1, data: d1 } = await completeRegistration({ username, password });

    if (r1.ok && d1.access_token) {
      msg.className = 'msg success';
      msg.textContent = '✅ 注册成功！请用 Element 等客户端连接 matrix2.bestar.de5.net 登录。';
      form.reset();
      return;
    }

    const session = d1.session;
    if (!session) {
      throw new Error(d1.error || d1.errcode || d1.raw || `首次注册请求失败：HTTP ${r1.status}`);
    }

    if (!flowIncludesStage(d1.flows, 'm.login.email.identity')) {
      throw new Error(`当前服务器未提供 m.login.email.identity 流程：${JSON.stringify(d1.flows || [])}`);
    }

    const { sid, clientSecret } = await requestEmailToken(email);
    msg.className = 'msg';
    msg.style.display = 'block';
    msg.textContent = '验证邮件已发送，请先点击邮件中的确认链接，再点击弹窗中的“确定”继续注册。';

    const confirmed = confirm('验证邮件已发送。请先完成邮件确认，然后点击“确定”继续注册。');
    if (!confirmed) {
      throw new Error('你已取消注册。完成邮件验证后可重新提交。');
    }

    const { response: r2, data: d2 } = await completeRegistration({
      username,
      password,
      auth: {
        type: 'm.login.email.identity',
        session,
        threepid_creds: {
          sid,
          client_secret: clientSecret
        }
      }
    });

    if (!r2.ok) {
      if (r2.status === 401 && Array.isArray(d2.completed) && d2.completed.includes('m.login.email.identity')) {
        const { response: r3, data: d3 } = await completeRegistration({
          username,
          password,
          auth: { session }
        });
        if (!r3.ok) {
          throw new Error(d3.error || d3.errcode || d3.raw || `最终注册请求失败：HTTP ${r3.status}`);
        }
        if (d3.access_token) {
          msg.className = 'msg success';
          msg.textContent = '✅ 注册成功！请用 Element 等客户端连接 matrix2.bestar.de5.net 登录。';
          form.reset();
          return;
        }
        throw new Error('服务器未返回 access_token，请稍后重试。');
      }
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