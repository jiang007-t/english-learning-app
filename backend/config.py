"""
config.py — API configuration for LLM story generation.

Instructions:
1. Fill in your DEEPSEEK_API_KEY below.
2. The API endpoint defaults to DeepSeek (api.deepseek.com).
3. If you use another OpenAI-compatible API, change API_BASE_URL.
"""

import os

# DeepSeek API 配置
# ⚠️ 安全提示：API Key 通过环境变量读取，不要直接写死
# 设置方式（Windows PowerShell）：
#   $env:DEEPSEEK_API_KEY="sk-你的key"
# 或创建 .env 文件，使用 python-dotenv 加载
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
API_BASE_URL = "https://api.deepseek.com/v1"  # DeepSeek 兼容 OpenAI 格式

# 如果非 DeepSeek，请修改为：
# API_BASE_URL = "https://api.moonshot.cn/v1"

# 模型选择
# DeepSeek 可选: "deepseek-chat" (普通), "deepseek-reasoner" (推理)
MODEL_NAME = "deepseek-chat"

# 生成参数
TEMPERATURE = 0.85  # 0-1, 越高越有创意
MAX_TOKENS = 600    # 最大生成长度（DeepSeek >500-800 不稳定，600 是可靠和完整度的平衡点）

# 如果使用 DeepSeek，请在这里填入你的 API Key
# 注册地址: https://platform.deepseek.com/
