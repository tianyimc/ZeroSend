# ZeroSend

极简、开源、端到端加密的阅后即焚文件分享服务，基于 Cloudflare Worker + KV + R2 (+ZeroTrust) 构建。

> 仓库地址：[github.com/tianyimc/ZeroSend](https://github.com/tianyimc/ZeroSend)  
> 基于原始项目：[fzxx/Cloudflare-Worker-Secret-doc](https://github.com/fzxx/Cloudflare-Worker-Secret-doc)

---

## ✨ 功能列表

| 功能 | 说明 |
|------|------|
| 🔒 **端到端加密** | 使用 AES-GCM 在浏览器端加密，服务器无法读取明文内容 |
| 📝 **Markdown 支持** | 编辑器支持 Markdown 格式，含实时预览与代码高亮 |
| 📁 **文件上传** | 支持上传任意文件（存储于 Cloudflare R2），可单独上传文件、单独发文字，或两者结合 |
| 🔑 **可选密码加密** | 支持额外设置访问密码，进行双重加密 |
| ⏰ **自动销毁** | 可设置最大查看次数与有效期，到期或次数用尽后自动删除 |
| 💥 **手动销毁** | 访问端可选择立即销毁文档 |
| 📋 **一键复制 + 二维码** | 生成链接后自动复制，并展示分享二维码 |
| 🌙 **深色模式** | 跟随系统配色或手动切换 |
| 🌐 **边缘计算** | 基于 Cloudflare Worker，全球低延迟访问 |
| 🛡️ **请求签名验证** | 前后端 HMAC 签名，防止伪造请求 |
| 🔐 **写端访问保护** | 可配合 Cloudflare Zero Trust Access 限制创建/管理权限 |
| ⚙️ **管理后台** | 查看、搜索、批量删除有效/历史文档 |
| 🎛️ **参数可配置** | 默认查看次数、有效期、文件大小上限等均可在设置页调整 |

---

## 🚀 部署教程

### 前提条件

- 拥有 [Cloudflare](https://www.cloudflare.com) 账号（免费套餐即可）

### 第一步：创建 KV 命名空间

1. 进入 Cloudflare 控制台 → **存储和数据库** → **Workers KV**；
2. 点击 **创建命名空间**，名称随意（如 `zerosend`）；
3. 记录该命名空间的 ID，后续绑定时使用。

### 第二步：创建 R2 存储桶（用于文件上传，若无需要可不做）

1. 进入 Cloudflare 控制台 → **存储和数据库** → **R2 对象存储**（注意：开启R2需要验证一个支付方式，可以选PayPal或MC/VISA等卡组织卡（银联不可，但内地MC/VISA卡等可以）；
2. 点击 **创建存储桶**，名称随意（如 `zerosend-files`）；
3. 若不需要文件上传功能，可跳过此步。

### 第三步：创建 Worker

1. 进入 **Compute（计算）** → **Workers 和 Pages** → **创建** → **创建应用程序**，选择从 *Hello World!* 开始，名称随意，点击**部署**（这里直接点部署，默认helloworld代码不在这里改）；
2. 进入刚创建的 Worker，点击**编辑代码**；
3. 将编辑器中的代码全部删除，复制并粘贴本仓库中 `ZeroSend.js` 的全部内容；
4. 根据需要修改文件头部的 `Config` 对象（见下方说明，可以暂时不填后续补上）；
5. 点击**部署**。

### 第四步：绑定 KV 与 R2

1. 进入 Worker → **设置** → **绑定** → **添加**；
2. 添加 **KV 命名空间**，变量名填 `Worker_Secret_doc`，选择第一步创建的 KV；
3. 如启用文件上传，再添加 **R2 存储桶**，变量名填 `Secret_doc_R2`，选择第二步创建的存储桶；
4. 点击**保存**。

### 第五步：绑定自定义域名

1. 先将域名接入 Cloudflare；
2. 进入 Worker → **设置** → **域和路由** → **添加** → **自定义域**；
3. 填写你的子域名（如 `send.yourdomain.com`），保存即可通过自定义域名访问。
注：本项目为安全性使用两个域（读写域和只读域），请都添加上去

### Config 配置说明

```js
var Config = {
  SharePath: "s",           // 分享链接路径前缀，如 /s/<id>
  Shareid_control: 2,       // 1: UUID，2: 短哈希ID
  Max_times: -1,            // 最大查看次数，-1 表示不限制
  Max_countdown: 10080,     // 最长有效期（分钟），10080 = 一周
  HmacKey: "风之幻想",      // HMAC 签名密钥，建议修改为随机字符串
  HomePageCacheDuration: 3600000, // 首页内存缓存时长（毫秒）
  BrowserCacheDuration: 86400,    // 浏览器缓存时长（秒）
  WriteDomain: "",          // 写操作专用域名，留空则不限制（单域名模式）
  ReadDomain: "",           // 生成分享链接时使用的域名，留空则使用请求域名
  CfTeamDomain: "",         // Cloudflare Zero Trust 团队名
  CfAccessAudience: ""      // Cloudflare Access 应用 Audience 标签
};
```

---

## 🔐 Cloudflare Zero Trust 写端保护（建议开启）

通过 Cloudflare Access 可将创建/管理文档的写操作限制为仅授权用户访问，分享链接的读操作仍对外完全公开，避免有人窃取读写域恶意使用导致你欠Cloudflare一屁股债。

### 架构示意

```
read.yourdomain.com   →  GET /s/<id>               公开，无需认证
write.yourdomain.com  →  GET /  POST /submit
                          POST /delete/             需通过 CF Access 认证
```

### 配置步骤

1. 在 `Config` 中填写 `WriteDomain`、`CfTeamDomain`、`CfAccessAudience`；
2. 将写域名和读域名均路由到同一个 Worker；
3. 进入 **Cloudflare Zero Trust** → **Access** → **Applications** → **Add an application**；
4. 选择 **Self-hosted**，Application domain 填写写域名；
5. 配置身份验证策略（邮箱、GitHub 组织等）；
6. 复制应用的 **Audience (AUD) Tag** 填入 `CfAccessAudience`，**Team domain** 填入 `CfTeamDomain`。

> **向后兼容**：`WriteDomain` 留空时，Worker 行为与单域名模式完全相同。

---

## ❓ 常见问题

**带预览的即时通讯或邮件会让链接被机器访问而失效，怎么办？**  
将查看次数设为 2 次或更多；或在 Cloudflare 防火墙中根据 User-Agent / 地区等规则拦截爬虫。

**文本大小限制是多少？**  
单个文档最大 100 KB（由 Cloudflare KV 免费额度决定）。

**文件大小限制是多少？**  
默认最大 100 MB/文件，可在设置页调整（受 Cloudflare R2 及网络条件影响，大文件上传可能中断）。

**KV 空间满了怎么清理？**  
进入 KV 命名空间手动删除，或删除整个命名空间后重新创建并绑定。不设自动清理是因为 API 调用次数有限额。

**为什么我上传了文件，但打开链接却没有文件？**
你的速度太快了，在提示上传完成后过一会再试试。建议至少为文件开放2次访问次数，其中一次自行查验。

---

## 📋 更新日志
>版本号说明：
> 1.0-1.5（2位版本号）为原开发者项目
> 1.5.1.1-1.5.1.2（4位版本号）为开发版项目
> 2.0.0-（3位版本号）位ZeroSend正式发布项目
### v2.0.0

- **ZeroSend**正式发布
- 支持仅上传文件（不再强制要求填写文本）
- 将文件最大大小上限移至设置页，可灵活调整（默认 100 MB）
- 修复设置页空白 bug（`setTheme` 对不存在的 highlight `<link>` 元素进行 null 判断）
- 修复生成二维码/上传完成后页面元素重叠错位问题

### v1.5.1.2 Preview
- 增加整个管理页面
- 优化销毁和删除，可以在创建时限制是否允许对外链接主动销毁文档
- 增加整个设置页面，支持修改各项默认值
- 支持将文本文件（txt,md等）拖拽入文本框
- 增加附件（R2 文件）上传与管理

### v1.5.1.1 Preview

- 增加 Cloudflare Zero Trust Access 集成，支持写端保护

### v1.5

- 增加文档ID校验、签名验证，防止恶意请求
- 增加缓存机制，优化UI逻辑

### v1.4

- 增加可选的用户密码
- 限制文档大小，美化UI
- 分享页修改为复制Markdown格式文档

### v1.3

- 增强3秒盾，使用AES-GCM端到端加密文档，防止服务器查看，分享页倒计时增加单位秒
- 调整UI，修复BUG

### v1.2

- 修改文档ID生成方式，使其不重复
- 增加Markdown格式文档，夜间模式，最大次数、最长时间设置
- 分享页倒计时，立刻销毁功能

### v1.1

- 生成链接后自动复制

### v1.0

- 阅后即焚
- 自定义分享链接路径、长度
- 简单防扫描3秒盾
