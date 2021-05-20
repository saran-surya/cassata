const http = require("http");
const express = require('express');
const router = express.Router();
const path = require('path');

const proxySettings = {
    roomId: 12345,
    password: "admin",
}


let io;

let isRoom = false;
let isClosed = false;
let finalResult = {};
let newServer;
let isCredentials = false;

let socketId;

let originSocket;



function isProxyConnected() {
    return isRoom;
}


async function init() {
    // Setting the data to the final Data to send the data to the server. 
    io.use((socket, next) => {
        // Setting the data in proxy success
        socket.on("ProxyDataSuccess", data => {
            if (!isClosed && isCredentials) {
                finalResult = { success: true, data }
            }
        })


        // Setting the data on proxy failure
        socket.on("ProxyError", data => {
            if (!isClosed && isCredentials) {
                finalResult = { success: false, data }
            }
        })
        next()
    });

    io.on("connection", (socket) => {

        // Creating a new proxyserver
        socket.on('CreateProxy', (room) => {
            if (proxySettings.roomId.toString() === room.roomId.toString() && room.password == proxySettings.password && !isRoom) {
                if (!socketId) {
                    socketId = room.socketid
                    originSocket = socket
                    // Configuring the socket.id to make sure we only persist one session
                    socket["id"] = socketId
                    console.log('\x1b[32m%s\x1b[0m', "proxy:server >> Proxy server has been connected and configured");
                    // socket.join()
                    isRoom = true;
                    isClosed = false;
                    isCredentials = true;
                    socket.emit("AuthSuccess", socketId)
                }
            }
            if (!isCredentials) {
                sendAuthFailure()
            }
        })

        // override the connection state, so no further requests are made.
        socket.on("override", (id) => {
            if (isCredentials && id == socketId) {
                console.log("\x1b[33m%s\x1b[0m", "proxy:server >> Overriding session")
                isClosed = true;
                isCredentials = false;
                isRoom = false;
                socketId = undefined;
                finalResult = {};
            } else {
                sendAuthFailure()
            }
        })
        // On the exit conditions for proxy disconnect
        socket.on("disconnect", () => {
            if (socket["id"] == socketId) {
                console.log("\x1b[33m%s\x1b[0m", "proxy:server >> Disconnecting the origin socket")
                isClosed = true;
                isCredentials = false;
                isRoom = false;
                finalResult = {};
                isRoom = false;
                socketId = undefined;
                originSocket = null;
            }
        })
    });
}


/**
 * ### perform get request using the proxied server.
 * @param {String} url the url you need to search for [Make sure the data returned is in form of JSON] 
 * @param {number} timeout the default timeout will be ***8000ms***  
 * @returns {Promise<JSON>} returns a promise of JSON from the request
 */
function getProxiedData(url, timeout = 8000) {
    return new Promise((resolve, reject) => {
        if (!isProxyConnected()) {
            console.log("\x1b[31m%s\x1b[0m", "\nproxy:server >> Use the method isProxyconnected() to check if the proxy client is connected")
            reject("Proxy server is not connected")
        }
        if (!isClosed && isCredentials && socketId) {
            originSocket.emit("getProxyData", { url, socketId })
        } else {
            sendAuthFailure();
        }
        // Checking data on regular intervals
        let msTimeout = 0;
        const interval = setInterval(() => {
            if (msTimeout >= timeout) {
                clearInterval(interval)
                reject(`The proxy server did not respond within ${timeout} ms`)
            }
            // on data success
            if (finalResult.success) {
                clearInterval(interval)
                resolve(finalResult)
            }
            // on data failure
            if (finalResult.success == false) {
                clearInterval(interval)
                reject(finalResult)
            }
            // to watch the time
            msTimeout += 10;
        }, 10);
    })
}

/**
 * ### used to send Auth failure message to the proxy-client
 */
function sendAuthFailure() {
    if (!socketId) {
        io.emit("AuthFailure");
    }
}

/**
 * Loading the front-end for the authentication
 */
router.get("/proxyrouter", async (req, res) => {
    res.sendFile(path.resolve(__dirname, 'build', 'index.html'))
})


/**
 * ### Takes an express server, and returns a proxy server, use the proxy server in return to listen to the data
 * @param {Express} server Provide the server created using express.
 * @returns {http.Server} Returns a proxied server,
 * @note use this server and listen to the ports
 * @example "Github link"
 */
function createProxy(server) {
    try {
        server.use(router)
        server.use("/proxydata", express.static(path.resolve(__dirname, 'build')))
        newServer = http.createServer(server);
        io = require('socket.io')(newServer, {
            cors: {
                origin: '*',
            }
        });
        // initializing the socket
        init();
        return newServer;
    } catch (error) {
        console.log("\x1b[31m%s\x1b[0m",`proxy:server >> ${error.message}`)
        return false;
    }
}

/**
 * Main exports
 */
module.exports = {
    createProxy,
    getProxiedData,
    isProxyConnected,
    proxySettings,
}
