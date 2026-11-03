# Google Search Tools

GloryCloud Google 搜索转发服务，可部署到 Vercel。首页提供查询输入和完整 JSON 下载；API 用于后续程序调用。

## 本地运行

需要 Node.js 22 或更高版本，无第三方运行依赖。

1. 复制 `.env.example` 为 `.env.local`。
2. 填写 `GLORYCLOUD_API_KEY` 和独立的 `RELAY_API_TOKEN`。
3. 执行 `npm run dev`，打开 `http://127.0.0.1:3000`。
4. 执行 `npm test` 运行接口测试。

调用令牌建议用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成。不要复用上游密钥作为调用令牌，不要将真实密钥提交到 GitHub。

## 部署到 Vercel

1. 将项目推送到 GitHub，在 Vercel 导入该仓库。
2. Framework Preset 选择 Other，Output Directory 为 `public`。项目自带 `vercel.json`，无需构建命令。
3. 在 Vercel 项目环境变量中配置 `GLORYCLOUD_API_KEY` 和 `RELAY_API_TOKEN`。可选配置 `SEARCH_DOMAIN`、`SEARCH_LANGUAGE`，默认 `com.hk`、`zh-CN`。
4. 部署后访问 `/api/health`，应看到 `ok: true` 和 `configured: true`。
5. 在首页输入调用令牌并查询；实际调用 `/api/search`，确认上游业务代码和搜索结果。HTTP 200 不等于搜索成功。

服务端从部署环境请求 GloryCloud，不使用本机的 7897 代理。**Vercel 默认出口 IP 不保证固定，也不保证在 GloryCloud 白名单中。** 如果仍返回 `41004`，需和上游确认允许的来源范围；要求固定出口 IP 时，应使用有固定出口的托管方案，或使用账户支持的 Vercel 固定出口能力并完成白名单配置。不要将一次成功当成永久放行。

函数的执行区域可以通过 Vercel 项目设置选择。本项目不指定区域，不假设某个地区一定获准。没有配置持久数据库，不保存查询历史或返回数据。

## 接口

### `POST /api/search`

请求头：

```http
Authorization: Bearer YOUR_RELAY_API_TOKEN
Content-Type: application/json
```

请求体：

```json
{
  "q": "inurl:blog + \"leave a reply\" + tool",
  "page": 1,
  "domain": "com.hk",
  "host_language": "zh-CN"
}
```

`q` 必填，原样传入上游 `query`，不会删除加号或引号。`page` 可选，默认 1，取值 1–100。`domain`、`host_language` 可选。`geo_location` 可选字符串，含义及可用值以 GloryCloud 文档为准。每次只请求一页，不自动翻页、不自动重试，避免意外消耗额度。接口拒绝其他输入字段，不能指定任意上游 URL。

上游固定为 `https://serpapi.glorycloud.cn/serpapi/v1/search`，使用 `engine=google_search`、`dataFormat=json`。上游 `api_key` 仅在服务端追加。

上游完整响应正文和 HTTP 状态直接返回，不添加包装，不删自然结果、广告或分页字段。若上游意外回显密钥/调用令牌，相关文本会替换为 `[REDACTED]`。不转发调用者 Cookie、Authorization 或上游响应头。`X-Upstream-Status` 为上游 HTTP 状态，`X-Relay-Request-Id` 用于区分请求。所有响应禁止缓存。

本服务错误：401 令牌无效；400 参数错误；413 请求体超过 8 KB；415 Content-Type 不支持；503 环境变量缺失；502 上游连接失败；504 上游超过 55 秒。上游返回的业务错误保留原样，例如：

```json
{"code":41004,"msg":"来源IP不允许访问","data":null}
```

Python 调用示例（密钥从环境变量读取）：

```python
import os, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

request = Request(
    os.environ['SEARCH_RELAY_URL'].rstrip('/') + '/api/search',
    data=json.dumps({'q': 'inurl:blog + "leave a reply" + tool', 'page': 1}).encode(),
    headers={'Authorization': 'Bearer ' + os.environ['SEARCH_RELAY_TOKEN'],
             'Content-Type': 'application/json'},
    method='POST',
)
try:
    response = urlopen(request, timeout=65)
except HTTPError as error:
    response = error
raw = response.read().decode('utf-8')
print(response.status, raw)
```

### `GET /api/health`

无需调用令牌，只报告服务可用及两个必需环境变量是否配置，不显示密钥，也不发起收费搜索请求。

## 安全与运行边界

首页不持久保存调用令牌，密钥不能放入前端代码或 `NEXT_PUBLIC_` 等公开环境变量。API 不开放跨域访问，没有将调用令牌放进 URL 的入口。持有调用令牌的人可以消耗上游额度，应按需更换令牌；如需公开给多人使用，应先增加独立账户、持久限额和计费控制。

本项目只转发和即时显示响应，不将结果长期存入服务器。首页可手动下载响应文件。不要在 Vercel 日志中打印上游请求 URL，它包含上游密钥。
