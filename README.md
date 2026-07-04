# 📖 故事英语 (Story English)

一款通过 AI 生成分支故事来学习英语单词的互动学习应用。

## 项目结构

```
english-learning-app/
├── frontend/           ← Cloudflare Pages 部署
│   ├── index.html      # 用户端首页
│   ├── admin.html      # 管理后台
│   ├── js/             # JavaScript 逻辑
│   ├── css/            # 样式
│   └── text_games/     # 经典互动故事
├── backend/            ← Render 部署
│   ├── server.py       # Flask API 入口
│   ├── database.py     # SQLite 数据库操作
│   ├── story_llm.py    # DeepSeek LLM 调用
│   ├── story_pipeline.py  # 故事树生成流水线
│   └── config.py       # 配置
└── story_templates/    # 故事模板（后端参考用）
```

## 部署指南

### 前端 → Cloudflare Pages

1. Fork 本仓库到你的 GitHub
2. 在 Cloudflare Dashboard → Pages → Create a project
3. 选择你的仓库，设置：
   - **Build command**: (留空)
   - **Build output directory**: `frontend`
4. 部署完成后，在 Pages Dashboard 的 **Environment variables** 设置：
   - 变量名: `BACKEND_URL`
   - 值: `https://你的后端应用名.onrender.com`

### 后端 → Render

1. 在 Render Dashboard → New → Web Service
2. 选择你的仓库
3. 设置：
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python server.py`
4. 添加环境变量：
   - `DEEPSEEK_API_KEY` = 你的 DeepSeek 密钥
   - `ADMIN_PASSWORD` = 管理员密码

### 本地开发

```bash
cd backend
pip install -r requirements.txt
python server.py
```

浏览器打开 http://127.0.0.1:5050/

## 技术栈

- **前端**: Vanilla JS + CSS
- **后端**: Python Flask
- **数据库**: SQLite
- **AI**: DeepSeek API
- **部署**: Cloudflare Pages + Render
