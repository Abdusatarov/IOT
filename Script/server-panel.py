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
from PIL import Image, ImageTk

SCRIPT = Path(__file__).resolve().parent
ROOT = SCRIPT.parent
LOGS = SCRIPT / 'logs'
LOGS.mkdir(exist_ok=True)
BACKEND = ROOT / 'air-quality-backend'
PORT = 8002
CLOUDFLARED_LOCK = threading.Lock()
preview_spec = importlib.util.spec_from_file_location('public_preview', SCRIPT / 'public-preview.py')
preview = importlib.util.module_from_spec(preview_spec)
preview_spec.loader.exec_module(preview)


class Panel:
    def __init__(self):
        self.window = tk.Tk()
        self.window.title('AlmatyAir — управление сервером')
        height = min(900, max(500, self.window.winfo_screenheight() - 100))
        self.window.geometry(f'940x{height}')
        self.window.minsize(860, min(700, height))
        self.tunnel = None
        self.gateway = None
        self.tunnel_busy = False
        self.tunnel_generation = 0
        self.public_url = ''
        self.client_tunnel = None
        self.client_gateway = None
        self.client_url = ''
        self.client_busy = False
        self.client_generation = 0
        self.client_lock = threading.Lock()
        self.auto_public = '--internet' in sys.argv
        self.process = None
        self.log = None
        self.busy = False
        self.closing = False
        self.messages = __import__('queue').Queue()
        viewport = ttk.Frame(self.window)
        viewport.pack(fill='both', expand=True)
        canvas = tk.Canvas(viewport, highlightthickness=0)
        scrollbar = ttk.Scrollbar(viewport, orient='vertical', command=canvas.yview)
        scrollbar.pack(side='right', fill='y')
        canvas.pack(side='left', fill='both', expand=True)
        canvas.configure(yscrollcommand=scrollbar.set)
        box = ttk.Frame(canvas, padding=24)
        content = canvas.create_window((0, 0), window=box, anchor='nw')
        box.bind('<Configure>', lambda _event: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<Configure>', lambda event: canvas.itemconfigure(content, width=event.width))
        self.window.bind('<MouseWheel>', lambda event: canvas.yview_scroll(-int(event.delta / 120), 'units'))
        ttk.Label(box, text='AlmatyAir', font=('Segoe UI', 24, 'bold')).pack()
        self.status = tk.StringVar(value='Сервер остановлен')
        ttk.Label(box, textvariable=self.status).pack(pady=12)
        buttons = ttk.Frame(box)
        buttons.pack()
        ttk.Button(buttons, text='▶ Запустить', command=self.start).pack(side='left', padx=5)
        ttk.Button(buttons, text='■ Остановить', command=self.stop).pack(side='left', padx=5)
        ttk.Button(buttons, text='Открыть сайт', command=lambda: webbrowser.open(f'http://127.0.0.1:{PORT}')).pack(side='left', padx=5)
        columns = ttk.Frame(box)
        columns.pack(fill='both', expand=True, pady=(20, 0))
        columns.columnconfigure(0, weight=1, uniform='qr')
        columns.columnconfigure(1, weight=1, uniform='qr')
        columns.rowconfigure(0, weight=1)
        site = ttk.LabelFrame(columns, text='1. Сайт — для зрителей', padding=16)
        site.grid(row=0, column=0, sticky='nsew', padx=(0, 8))
        sensor = ttk.LabelFrame(columns, text='2. Датчик / Android — отправка данных', padding=16)
        sensor.grid(row=0, column=1, sticky='nsew', padx=(8, 0))
        self.website_mode = tk.StringVar(value='lan')
        modes = ttk.Frame(site)
        modes.pack(pady=(0, 8))
        ttk.Radiobutton(modes, text='Локальная сеть', variable=self.website_mode, value='lan', command=self.qr).pack(side='left')
        ttk.Radiobutton(modes, text='Интернет', variable=self.website_mode, value='internet', command=self.qr).pack(side='left')
        ttk.Button(site, text='Включить демо-доступ клиентам', command=self.start_clients).pack(pady=4)
        ttk.Button(site, text='Отключить демо-доступ', command=self.stop_clients).pack(pady=4)
        self.client_status = tk.StringVar(value='Интернет-доступ зрителей выключен')
        ttk.Label(site, textvariable=self.client_status, wraplength=360, justify='center').pack(pady=6)
        ttk.Label(site, text='Адрес ноутбука в Wi-Fi / хот-споте:').pack(pady=(0, 6))
        self.address = tk.StringVar()
        self.combo = ttk.Combobox(site, textvariable=self.address)
        self.combo.pack(fill='x')
        self.combo.bind('<<ComboboxSelected>>', self.qr)
        self.combo.bind('<Return>', self.qr)
        ttk.Button(site, text='Обновить адреса / QR сайта', command=self.addresses).pack(pady=8)
        self.url = tk.StringVar()
        ttk.Entry(site, textvariable=self.url, state='readonly', justify='center').pack(fill='x')
        self.picture = ttk.Label(site)
        self.picture.pack(pady=12)
        ttk.Button(site, text='Копировать ссылку сайта', command=self.copy_link).pack(pady=4)
        ttk.Label(site, text='Сканируйте камерой телефона для открытия сайта.\n'
                  'Локально нужна общая Wi-Fi сеть.\n'
                  'В режиме Интернет карта и GPS видны всем со ссылкой,\n'
                  'пока включён демо-доступ. Только просмотр.\n'
                  'Для доступа с телефона не используйте localhost.\n'
                  'При блокировке: Script/enable-lan.ps1\n'
                  'от администратора один раз.', justify='center', wraplength=360).pack(pady=10)
        self.sync_url = tk.StringVar()
        ttk.Label(sensor, text='Отдельный HTTPS-адрес для Android:').pack(pady=(0, 6))
        ttk.Button(sensor, text='Подключить датчик через интернет', command=self.start_public).pack(pady=4)
        ttk.Button(sensor, text='Отключить передачу через интернет', command=self.stop_public).pack(pady=4)
        ttk.Entry(sensor, textvariable=self.sync_url, state='readonly', justify='center').pack(fill='x', pady=(8, 0))
        self.sync_picture = ttk.Label(sensor, text='QR появится после подключения', anchor='center')
        self.sync_picture.pack(pady=12, ipady=6)
        self.public_status = tk.StringVar(value='Интернет-передача выключена')
        ttk.Label(sensor, textvariable=self.public_status, wraplength=360, justify='center').pack(pady=6)
        ttk.Button(sensor, text='Копировать адрес для Android', command=self.copy_sync_link).pack(pady=4)
        ttk.Button(sensor, text='Копировать ключ Android', command=self.copy_sync_token).pack(pady=4)
        ttk.Label(sensor, text='Это адрес синхронизации, а не страница сайта.\n'
                  'В приложении укажите HTTPS-адрес и sync key.\n'
                  'В Android нажмите «Сканировать QR сервера».\n'
                  'Личный QR содержит адрес и ключ. Не публикуйте его.\n'
                  'ESP32 подключается к телефону по Bluetooth.', justify='center', wraplength=360).pack(pady=10)
        self.addresses()
        self.window.protocol('WM_DELETE_WINDOW', self.close)
        self.window.after(500, self.poll)
        if self.auto_public or '--start' in sys.argv:
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
        if self.website_mode.get() == 'internet':
            if self.client_url:
                self.show_qr(self.client_url)
            else:
                self.url.set('')
                self.picture.configure(image='', text='Нажмите «Включить демо-доступ клиентам»')
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
        image = qrcode.make(url).get_image().resize((240, 240), Image.Resampling.NEAREST)
        self.photo = ImageTk.PhotoImage(image)
        self.picture.configure(image=self.photo, text='')

    def show_sync_qr(self, url):
        self.sync_url.set(url)
        if not url:
            self.sync_photo = None
            self.sync_picture.configure(image='', text='QR появится после подключения')
            return
        payload = json.dumps({'type': 'airmonitor.sync', 'version': 1,
                              'server_url': url, 'sync_key': preview.get_sync_token(SCRIPT)},
                             separators=(',', ':'))
        image = qrcode.make(payload).get_image().resize((264, 264), Image.Resampling.NEAREST)
        self.sync_photo = ImageTk.PhotoImage(image)
        self.sync_picture.configure(image=self.sync_photo, text='')

    def copy_sync_link(self):
        if not self.public_url:
            messagebox.showinfo('Датчик / Android', 'Сначала нажмите «Подключить датчик через интернет».')
            return
        self.window.clipboard_clear()
        self.window.clipboard_append(self.sync_url.get())

    def copy_link(self):
        self.window.clipboard_clear()
        self.window.clipboard_append(self.url.get())

    def copy_sync_token(self):
        token = preview.get_sync_token(SCRIPT)
        self.window.clipboard_clear()
        self.window.clipboard_append(token)
        self.public_status.set('Ключ скопирован. Вставьте его в поле Android sync key приложения.')

    def start_clients(self):
        if self.client_busy:
            return
        if self.client_tunnel and self.client_tunnel.poll() is None:
            self.website_mode.set('internet')
            self.qr()
            return
        try:
            with urlopen(f'http://127.0.0.1:{PORT}/api/v1/health', timeout=2) as response:
                if response.status != 200:
                    raise RuntimeError('Backend not ready')
        except Exception:
            messagebox.showinfo('Сайт для клиентов', 'Сначала запустите сервер.')
            return
        self.client_generation += 1
        generation = self.client_generation
        self.client_busy = True
        self.client_status.set('Создание ссылки для зрителей…')
        threading.Thread(target=self.launch_clients, args=(generation,), daemon=True).start()

    def launch_clients(self, generation):
        gateway = None
        tunnel = None
        try:
            with CLOUDFLARED_LOCK:
                binary = preview.install_cloudflared(SCRIPT)
            from dotenv import dotenv_values
            backend_key = os.environ.get('API_KEY', dotenv_values(BACKEND / '.env').get('API_KEY'))
            with self.client_lock:
                if generation != self.client_generation:
                    return
                gateway = preview.gateway(PORT, backend_api_key=backend_key, public_read=True)
                self.client_gateway = gateway
                threading.Thread(target=gateway.serve_forever, daemon=True).start()
                tunnel = subprocess.Popen([str(binary), '--no-autoupdate', 'tunnel',
                    '--url', f'http://127.0.0.1:{gateway.server_port}', '--protocol', 'http2'],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                    errors='replace', creationflags=subprocess.CREATE_NO_WINDOW)
                self.client_tunnel = tunnel
            with open(LOGS / 'client-tunnel.log', 'a', encoding='utf-8') as log:
                for line in tunnel.stdout:
                    log.write(line)
                    log.flush()
                    match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com\b', line)
                    if match and match.group() not in ('https://api.trycloudflare.com', 'https://www.trycloudflare.com'):
                        self.messages.put(('client_url', generation, match.group()))
            self.messages.put(('client_status', generation, 'Демо-доступ завершился. Создайте ссылку заново.'))
        except Exception as exc:
            self.messages.put(('client_status', generation, 'Ошибка доступа зрителей: ' + str(exc)))
        finally:
            if tunnel and tunnel.poll() is None:
                tunnel.terminate()
                tunnel.wait(timeout=10)
            with self.client_lock:
                if gateway and self.client_gateway is gateway:
                    gateway.shutdown()
                    gateway.server_close()
                    self.client_gateway = None
                if self.client_tunnel is tunnel:
                    self.client_tunnel = None
            if generation == self.client_generation:
                self.client_busy = False

    def stop_clients(self):
        with self.client_lock:
            self.client_generation += 1
            if self.client_tunnel and self.client_tunnel.poll() is None:
                self.client_tunnel.terminate()
                self.client_tunnel.wait(timeout=10)
            self.client_tunnel = None
            if self.client_gateway:
                self.client_gateway.shutdown()
                self.client_gateway.server_close()
                self.client_gateway = None
        self.client_busy = False
        self.client_url = ''
        self.client_status.set('Интернет-доступ зрителей выключен')
        self.website_mode.set('lan')
        self.qr()

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
            with CLOUDFLARED_LOCK:
                binary = preview.install_cloudflared(SCRIPT)
            if generation != self.tunnel_generation:
                return
            from dotenv import dotenv_values
            backend_key = os.environ.get('API_KEY', dotenv_values(BACKEND / '.env').get('API_KEY'))
            self.gateway = preview.gateway(PORT, preview.get_sync_token(SCRIPT), backend_key, public_read=False)
            threading.Thread(target=self.gateway.serve_forever, daemon=True).start()
            self.tunnel = subprocess.Popen([str(binary), '--no-autoupdate', 'tunnel',
                '--url', f'http://127.0.0.1:{self.gateway.server_port}', '--protocol', 'http2'],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                errors='replace', creationflags=subprocess.CREATE_NO_WINDOW)
            with open(LOGS / 'public-tunnel.log', 'a', encoding='utf-8') as log:
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
        self.public_status.set('Интернет-передача выключена')
        self.show_sync_qr('')

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
            self.log = open(LOGS / 'server-panel.log', 'a', encoding='utf-8')
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
        self.stop_clients()
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
                if kind in ('client_url', 'client_status'):
                    if generation == self.client_generation:
                        if kind == 'client_url':
                            self.client_busy = False
                            self.client_url = value
                            self.website_mode.set('internet')
                            self.qr()
                            self.client_status.set('Сайт и GPS доступны зрителям по ссылке до отключения демо-доступа.')
                        else:
                            self.client_url = ''
                            self.website_mode.set('lan')
                            self.qr()
                            self.client_status.set(value)
                    continue
                if generation == self.tunnel_generation:
                    if kind == 'public_url':
                        self.public_url = value
                        (SCRIPT / '.tools' / 'public-url.txt').write_text(value, encoding='utf-8')
                        self.show_sync_qr(value)
                        self.public_status.set('Передача включена. QR сайта слева не изменился.')
                    else:
                        self.public_url = ''
                        self.show_sync_qr('')
                        self.public_status.set(value)
            else:
                self.status.set(message)
        if self.process:
            if self.process.poll() is not None:
                self.status.set('Сервер завершился. См. Script/logs/server-panel.log')
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
