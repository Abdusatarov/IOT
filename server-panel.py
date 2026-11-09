"""Local Windows server controls. Run with the backend virtual environment."""
import json
import importlib.util
import re
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox
from urllib.request import urlopen
import webbrowser

import qrcode
from PIL import ImageTk

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / 'air-quality-backend'
PORT = 8002
preview_spec = importlib.util.spec_from_file_location('public_preview', ROOT / 'public-preview.py')
preview = importlib.util.module_from_spec(preview_spec)
preview_spec.loader.exec_module(preview)


class Panel:
    def __init__(self):
        self.window = tk.Tk()
        self.window.title('AlmatyAir — управление сервером')
        self.window.geometry('560x820')
        self.tunnel = None
        self.gateway = None
        self.tunnel_busy = False
        self.tunnel_generation = 0
        self.public_url = ''
        self.auto_public = '--internet' in sys.argv
        self.process = None
        self.log = None
        self.busy = False
        self.closing = False
        self.messages = __import__('queue').Queue()
        box = ttk.Frame(self.window, padding=24)
        box.pack(fill='both', expand=True)
        ttk.Label(box, text='AlmatyAir', font=('Segoe UI', 24, 'bold')).pack()
        self.status = tk.StringVar(value='Сервер остановлен')
        ttk.Label(box, textvariable=self.status).pack(pady=12)
        buttons = ttk.Frame(box)
        buttons.pack()
        ttk.Button(buttons, text='▶ Запустить', command=self.start).pack(side='left', padx=5)
        ttk.Button(buttons, text='■ Остановить', command=self.stop).pack(side='left', padx=5)
        ttk.Button(buttons, text='Открыть сайт', command=lambda: webbrowser.open(f'http://127.0.0.1:{PORT}')).pack(side='left', padx=5)
        ttk.Label(box, text='Адрес ноутбука для телефона:').pack(pady=(24, 6))
        self.address = tk.StringVar()
        self.combo = ttk.Combobox(box, textvariable=self.address)
        self.combo.pack(fill='x')
        self.combo.bind('<<ComboboxSelected>>', self.qr)
        self.combo.bind('<Return>', self.qr)
        ttk.Button(box, text='Обновить адреса / QR', command=self.addresses).pack(pady=8)
        self.url = tk.StringVar()
        ttk.Entry(box, textvariable=self.url, state='readonly', justify='center').pack(fill='x')
        self.picture = ttk.Label(box)
        self.picture.pack(pady=12)
        internet_buttons = ttk.Frame(box)
        internet_buttons.pack(pady=5)
        ttk.Button(internet_buttons, text='🌐 Интернет-ссылка', command=self.start_public).pack(side='left', padx=4)
        ttk.Button(internet_buttons, text='Отключить интернет', command=self.stop_public).pack(side='left', padx=4)
        self.public_status = tk.StringVar(value='Интернет-доступ выключен')
        ttk.Label(box, textvariable=self.public_status, wraplength=490, justify='center').pack(pady=6)
        ttk.Button(box, text='Копировать ссылку', command=self.copy_link).pack()
        ttk.Label(box, text='Подключите телефон к Wi-Fi / хот-споту ноутбука.\n'
                  'Затем отсканируйте QR камерой телефона.\n'
                  'При блокировке доступа запустите enable-lan.ps1\n'
                  'от имени администратора один раз.', justify='center').pack()
        self.addresses()
        self.window.protocol('WM_DELETE_WINDOW', self.close)
        self.window.after(500, self.poll)
        if self.auto_public:
            self.window.after(100, self.start)

    def addresses(self):
        try:
            result = subprocess.run(['powershell', '-NoProfile', '-Command',
                "@(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -ExpandProperty IPAddress) | ConvertTo-Json -Compress"],
                capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            addresses = json.loads(result.stdout or '[]')
            if isinstance(addresses, str):
                addresses = [addresses]
        except Exception:
            addresses = []
        addresses = sorted(set(addresses), key=lambda a: (not a.startswith('192.168.137.'), a))
        self.combo['values'] = addresses or ['127.0.0.1']
        if self.address.get() not in addresses:
            self.address.set(addresses[0] if addresses else '127.0.0.1')
        self.qr()

    def qr(self, _=None):
        if self.public_url:
            self.show_qr(self.public_url)
            return
        try:
            socket.inet_aton(self.address.get())
        except OSError:
            messagebox.showerror('Адрес', 'Укажите IPv4-адрес ноутбука.')
            return
        url = f'http://{self.address.get()}:{PORT}/'
        self.show_qr(url)

    def show_qr(self, url):
        self.url.set(url)
        image = qrcode.make(url).get_image().resize((260, 260))
        self.photo = ImageTk.PhotoImage(image)
        self.picture.configure(image=self.photo)

    def copy_link(self):
        self.window.clipboard_clear()
        self.window.clipboard_append(self.url.get())

    def start_public(self):
        if self.tunnel_busy or (self.tunnel and self.tunnel.poll() is None):
            return
        try:
            with urlopen(f'http://127.0.0.1:{PORT}/api/v1/health', timeout=2) as response:
                if response.status != 200:
                    raise RuntimeError('Backend not ready')
        except Exception:
            messagebox.showinfo('Сервер', 'Сначала запустите сервер и дождитесь статуса «Сервер работает».')
            return
        self.tunnel_busy = True
        self.tunnel_generation += 1
        generation = self.tunnel_generation
        self.public_status.set('Подготовка cloudflared и временной ссылки…')
        threading.Thread(target=self.launch_public, args=(generation,), daemon=True).start()

    def launch_public(self, generation):
        try:
            binary = preview.install_cloudflared(ROOT)
            if generation != self.tunnel_generation:
                return
            self.gateway = preview.gateway(PORT)
            threading.Thread(target=self.gateway.serve_forever, daemon=True).start()
            self.tunnel = subprocess.Popen([str(binary), '--no-autoupdate', 'tunnel',
                '--url', f'http://127.0.0.1:{self.gateway.server_port}', '--protocol', 'http2'],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                errors='replace', creationflags=subprocess.CREATE_NO_WINDOW)
            with open(BACKEND / 'public-tunnel.log', 'a', encoding='utf-8') as log:
                for line in self.tunnel.stdout:
                    log.write(line)
                    log.flush()
                    match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com\b', line)
                    if match and match.group() not in ('https://api.trycloudflare.com', 'https://www.trycloudflare.com'):
                        self.messages.put(('public_url', generation, match.group()))
            self.messages.put(('public_status', generation, 'Туннель завершился. Создайте ссылку заново.'))
        except Exception as exc:
            self.messages.put(('public_status', generation, 'Ошибка интернет-доступа: ' + str(exc)))
        finally:
            self.tunnel_busy = False

    def stop_public(self):
        self.tunnel_generation += 1
        if self.tunnel and self.tunnel.poll() is None:
            self.tunnel.terminate()
            self.tunnel.wait(timeout=10)
        self.tunnel = None
        if self.gateway:
            self.gateway.shutdown()
            self.gateway.server_close()
            self.gateway = None
        self.public_url = ''
        self.public_status.set('Интернет-доступ выключен')
        self.qr()

    def start(self):
        if self.busy or (self.process and self.process.poll() is None):
            return
        if not (ROOT / 'almatyair-frontend/dist/index.html').is_file():
            messagebox.showerror('Нет сборки', 'В папке almatyair-frontend выполните npm ci и npm run build.')
            return
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', PORT)) == 0:
                messagebox.showinfo('Порт занят', 'Сервер на 8002 уже запущен вне панели.\nОстановите его в исходном окне, затем запустите здесь.')
                return
        self.busy = True
        self.status.set('Применение миграций…')
        threading.Thread(target=self.launch, daemon=True).start()

    def launch(self):
        try:
            self.log = open(BACKEND / 'server-panel.log', 'a', encoding='utf-8')
            env = {**os.environ, 'HOST': '0.0.0.0', 'PORT': str(PORT)}
            subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=BACKEND,
                           env=env, stdout=self.log, stderr=self.log, check=True,
                           creationflags=subprocess.CREATE_NO_WINDOW)
            if self.closing:
                return
            self.process = subprocess.Popen([sys.executable, '-m', 'app'], cwd=BACKEND,
                env=env, stdout=self.log, stderr=self.log, creationflags=subprocess.CREATE_NO_WINDOW)
            self.messages.put('Запуск сервера…')
        except Exception as exc:
            self.messages.put('Ошибка запуска: ' + str(exc))
        finally:
            self.busy = False

    def stop(self):
        if self.busy:
            messagebox.showinfo('Запуск', 'Дождитесь завершения миграций.')
            return
        self.stop_public()
        if self.process and self.process.poll() is None:
            subprocess.run(['taskkill', '/PID', str(self.process.pid), '/T', '/F'],
                capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            self.process.wait(timeout=10)
        self.process = None
        if self.log:
            self.log.close()
            self.log = None
        self.status.set('Сервер остановлен')

    def poll(self):
        while not self.messages.empty():
            message = self.messages.get()
            if isinstance(message, tuple):
                kind, generation, value = message
                if generation == self.tunnel_generation:
                    if kind == 'public_url':
                        self.public_url = value
                        (ROOT / '.tools' / 'public-url.txt').write_text(value, encoding='utf-8')
                        self.show_qr(value)
                        self.public_status.set('Временная ссылка для любого интернета · только просмотр')
                    else:
                        self.public_url = ''
                        self.qr()
                        self.public_status.set(value)
            else:
                self.status.set(message)
        if self.process:
            if self.process.poll() is not None:
                self.status.set('Сервер завершился. См. air-quality-backend/server-panel.log')
            else:
                try:
                    with urlopen(f'http://127.0.0.1:{PORT}/api/v1/health', timeout=.5) as response:
                        self.status.set('● Сервер работает' if response.status == 200 else 'Ошибка API')
                        if response.status == 200 and self.auto_public:
                            self.auto_public = False
                            self.start_public()
                except Exception:
                    self.status.set('Ожидание ответа API…')
        self.window.after(1500, self.poll)

    def close(self):
        if self.busy:
            messagebox.showinfo('Запуск', 'Дождитесь завершения миграций.')
            return
        if self.process and self.process.poll() is None:
            if not messagebox.askyesno('Закрыть панель', 'Остановить сервер и закрыть панель?'):
                return
        self.closing = True
        self.stop()
        self.window.destroy()


if __name__ == '__main__':
    Panel().window.mainloop()
