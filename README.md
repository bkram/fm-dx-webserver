# FM-DX Webserver 📻🌐

FM-DX Webserver is a cross-platform web server designed for FM DXers who want to control their TEF6686 / F1HD receiver through a web interface.

## Features

- 🌐 **Web-Based Control:** Access and control your TEF6686 / F1HD receiver from any device with a web browser.
- 📻 **FM DXing:** Enhance your FM DXing experience with a user-friendly web interface.
- **Cross-Platform:** You can run this on both Windows and Linux servers along with xdrd.
- **Tuner control:** Control your FM tuner on the go. Phone? Tablet? No problem.

##  Features to be added
- **Password authentication:** Currently anyone can control the tuner. In the near future, we will implement password authentication, by default all the data will be read-only.
- **Low-latency streaming**: Currently planned as a feature similar to WebSDRs to provide a zero-delay audio using your browser.
- **Pre-compiled app version**: Currently planned right after finishing the low-latency streaming feature. 

## Getting Started

1. Clone the repository:

    ```bash
    git clone https://github.com/NoobishSVK/FM-DX-Webserver.git
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

    
3. Update your config in index.js:

    ```js
    const webServerHost = '192.168.1.39'; // IP of the web server
    const webServerPort = 8080; // web server port

    const xdrdServerHost = '192.168.1.15'; // xdrd server iP
    const xdrdServerPort = 7373; // xdrd server port

    ```


4. Start the server:

    ```bash
    node .
    ```

4. Open your web browser and navigate to `http://web-server-ip:web-server-port` to access the web interface.

## Dependencies

This project utilizes the [librdsparser](https://github.com/kkonradpl/librdsparser) library for RDS parsing. Make sure to check out the library for more information.

## Contributing

Feel free to contribute to the project by opening issues or submitting pull requests. Your input is valuable!

## License

This project is licensed under the [GNU-GPL v3 License](LICENSE.md).

## Acknowledgments

- Thanks to [librdsparser](https://github.com/kkonradpl/librdsparser) for providing the RDS parsing functionality.

Happy DXing! 🎶📡
