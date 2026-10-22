import os
import uvicorn

if __name__ == '__main__':
    uvicorn.run('manager.app:create_app', factory=True,
                host=os.environ.get('DOUYIN_HOST', '127.0.0.1'),
                port=int(os.environ.get('DOUYIN_PORT', '8787')))
