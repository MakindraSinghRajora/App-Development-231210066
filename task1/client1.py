import socket
import threading

HOST = '127.0.0.1'  
PORT = 5000

client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect((HOST, PORT))

username = input("Enter your name: ")

def receive():
    while True:
        try:
            message = client.recv(1024).decode('utf-8')
            if message == "USERNAME":
                client.send(username.encode('utf-8'))
            elif message=="-1":
                disconnect()
            else:
                print(message)
        except:
            print("Error!")
            client.close()
            break
def disconnect():
    client.close()
def write():
    while True:
        message = f"{username}: {input('')}"
        client.send(message.encode('utf-8'))

threading.Thread(target=receive).start()
threading.Thread(target=write).start()