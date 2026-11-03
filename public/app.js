const form = document.querySelector('#search-form');
const submit = document.querySelector('#submit');
const status = document.querySelector('#status');
const output = document.querySelector('#result');
const download = document.querySelector('#download');
let raw = '';
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; download.disabled = true; raw = '';
  status.textContent = '正在查询，请等待接口返回…'; output.textContent = '请求中';
  const started = performance.now();
  try {
    const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.querySelector('#token').value}` }, body: JSON.stringify({ q: document.querySelector('#q').value, page: Number(document.querySelector('#page').value), domain: document.querySelector('#domain').value, host_language: document.querySelector('#language').value }), signal: AbortSignal.timeout(65000) });
    raw = await response.text();
    let data; try { data = JSON.parse(raw); output.textContent = JSON.stringify(data, null, 2); } catch { output.textContent = raw || '接口返回空内容'; }
    const business = data && typeof data === 'object' && data.code !== undefined ? ` · 业务代码 ${data.code}` : '';
    status.textContent = `HTTP ${response.status}${business} · 耗时 ${((performance.now() - started) / 1000).toFixed(1)} 秒。HTTP 200 也可能包含上游业务错误，请查看返回内容。`;
    download.disabled = !raw;
  } catch { status.textContent = '请求未完成，请检查网络或稍后手动重试。'; output.textContent = '没有收到接口响应。'; }
  finally { submit.disabled = false; }
});
download.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `google-search-page-${document.querySelector('#page').value}-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
