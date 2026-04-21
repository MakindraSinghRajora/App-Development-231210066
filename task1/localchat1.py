import socket
import threading

HOST = '0.0.0.0'
PORT = 5000

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind((HOST, PORT))
server.listen()

clients = []
usernames = []

def broadcast(message):
    for client in clients:
        try:
            client.send(message)
        except:
            pass

def handle_client(client):
    while True:
        try:
            message = client.recv(1024)

            print(message.decode('utf-8'))

            broadcast(message)

        except:
            index = clients.index(client)
            clients.remove(client)
            client.close()
            username = usernames[index]

            leave_msg = f"{username} left the chat"
            print(leave_msg)
            broadcast(leave_msg.encode('utf-8'))

            usernames.remove(username)
            break

def receive():
    print("Server is running...")

    while True:
        client, address = server.accept()
        print(f"Connected with {address}")

        client.send("USERNAME".encode('utf-8'))
        username = client.recv(1024).decode('utf-8')

        usernames.append(username)
        clients.append(client)

        join_msg = f"{username} joined the chat!"
        print(join_msg)
        broadcast(join_msg.encode('utf-8'))

        thread = threading.Thread(target=handle_client, args=(client,))
        thread.start()

def write_server():
    while True:
        message = f"SERVER: {input('')}"
        broadcast(message.encode('utf-8'))

threading.Thread(target=receive).start()
threading.Thread(target=write_server).start()