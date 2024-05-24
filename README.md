# KotChat

KotChat is a simple chat application built using Express.js for the backend and jQuery for the frontend. It allows users to engage in real-time communication in a chatroom environment.

## Installation

To install KotChat, follow these steps:

1. Clone the repository to your local machine:

   ```
   git clone https://github.com/Vyasdev217/KotChat.git
   ```

2. Navigate to the project directory:

   ```
   cd KotChat
   ```

3. Create the necessary configuration files and certificates in the parent directory of the project folder:
   - `config.json`: Configuration file for your application. It should look like this:
   ```json
   {
       "KOTCHAT_MONGO_CONNECTION_STRING": "<your MongoDB connection string>",
       "hashsalt": "<your hash salt string>"
   }
   ```
   - `password.txt`: Text file containing the password for total admin access.

4. Install dependencies:

   ```
   npm install
   ```

## Usage

To start the KotChat server, run the following command:

```
npm start
```

By default, the server will be running on port 3000. You can access the application by navigating to `http://localhost:3000` in your web browser.

To gain total admin access, make a POST request to `/su` with the following data:
```json
{
    "password": "<password in password.txt>"
}
```

## Contributing

Contributions are welcome! Feel free to submit pull requests or open issues if you encounter any problems or have suggestions for improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
