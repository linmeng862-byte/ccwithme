"""把千问 API Key 写入 Chat-C 数据库"""
import sqlite3, sys, os

KEY_NAME = 'qwen_api_key'
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'claude.db')

def main():
    # 从命令行参数或环境变量或交互输入读取 key
    key = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('QWEN_API_KEY', '')
    if not key:
        key = input('请输入千问 API Key: ').strip()
    if not key:
        print('错误: 未提供 key')
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (KEY_NAME, key))
    conn.commit()
    conn.close()
    # 验证
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (KEY_NAME,)).fetchone()
    conn.close()
    if row:
        print(f'已存储！key 前缀: {row[0][:12]}...')
    else:
        print('存储失败')

if __name__ == '__main__':
    main()
