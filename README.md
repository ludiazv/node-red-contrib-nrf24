# Node-Red freedom for nRF24l01 / nRF24l01+ radios

[![GitHub issues](https://img.shields.io/github/issues/ludiazv/node-red-contrib-nrf24.svg)](https://github.com/ludiazv/node-red-contrib-nrf24/issues)
![npm](https://img.shields.io/npm/v/node-red-contrib-nrf24)
![GitHub tag (latest by date)](https://img.shields.io/github/v/tag/ludiazv/node-red-contrib-nrf24)

This package implement Node-RED nodes for using __nRF24L01 / nRF24l01+__ radios easy, fast and with typical NODE-Red flow semantics. This will enable NODE-RED flows to receive and send data to sensors and controllers (such arduinos or other mcus based appliances) and integrate them with complex logic and outstanding presentation and charting capabilities of Node-Red.

This module is based on *nodejs* package __nrf24__. Please check [here](https://github.com/ludiazv/node-nrf24) the full documentation about how to wire and configure SPI interfaces of your Raspberry Pi or other Single Board computers (SBCs) such Orange Pis, NanoPi , BeagleBone,...

 The package provide the following functionality:

- Basic __nRF24L01 / nRF24l01+__ communication via input and output nodes.
- Create or join a __RF24Mesh__ network with a simple node.  (In testing)
- Deploy directly a __RF24Ethernet__ gateway to enable to provide TCP/IP conectivity to arduinos an sensors via __nRF24L01__ radios. *(In development)*

If you **like** this project and want to support **the development and maintenance** please consider a donation.

<p align="center">
  <a href="https://www.buymeacoffee.com/boros" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-white.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
</p>


## Installation

Run the follwing commands under ``$HOME/.node-red``.

```bash
npm install node-red-contrib-nrf24

```

If you experience any problems try to install __nrf24__ first:

```bash
npm install nrf24@0.2.0-beta
npm install node-red-contrib-nrf24
```

Installation via palette is not recommended. Base library require compilation of binaries and is recommended to follow the installation output in the command line to check installation is corrrect.

After installation node-red need to be restarted to load the new installed nodes. The new nodes will be available under ``nRF24l01`` category in the palette.

## Prerequisites

The package is written in pure javascript following coding standards of Node-RED. It depends, however, on __nrf24__ module that is and C++ add-on that require custom build.

Please check the the __prerequisites__ of __nrf24__ [here](https://github.com/ludiazv/node-nrf24) to validate your installation. It should cover:

- Wiring and GPIO mapping.
- nrf24 package installation.

## Usage

The usage of nodes is similar to standard Node-RED nodes:

1. Place the node on your flow
2. Click on the created node to configure it.
3. Connect inputs/outputs to your flow logic.
4. Deploy the nodes/flow.

## Vanilla RF24 radio communication

Check out this simple example of an echo/relay service:

![rf24 example](images/rf24-example-flow.png?raw=true)

Only Two nodes are required to implement the radio communication. The first node listen to radio frames and emits them over it's sole output. The payloads received are wired to the output node that delivers back to the radio. Simple as pie. This to nodes are equivalent to dozens of lines of code without any programing and Node-RED freedom.

### The radio configuration node (rf24radio)

The radio harware is represented in Node-RED using a ["configuration node"](https://nodered.org/docs/creating-nodes/config-nodes) where all the information wiring and physical interface is defined.

Configuration nodes can be created directly from input or output nodes or via Node-Red "Configuration nodes" menu and then associate the radio node to Input or outputs nodes.

The radio configuration node has the following fields to be filled:
![radio-props](images/radio-props.png?raw=true)

Check the documentation inside node-red **doc tab** of the configuration node for a quick guide of each configuraion field.


### Reading frames/packets (rf24input)

To read frames sent over the radio an __rf24input__ node need to placed in your flow. This node represent a *reading pipe* in __nRF24L01__ terminology. A pipe is a virtual one-way channel of communication between radios. If a device write to a pipe, all radios listening in that pipe will receive the packet.



Configuring an input node require only few parameters:

![input-props](images/input-props.png?raw=true)

Check the documentation inside node-red **doc tab** of the input node for a quick guide of each configuraion field.

>__Caveat__: In this implementation only 40-bit (5-bytes) pipe numbers are supported as recommended by __nRF24L01__ manufacturer.


### Writing frames/packets (rf24ouput)

In a similar way as the input node. The output node enable to send information over the radio in a *writing pipe*.

Configuring the node require a minimal parametrization:
![output-props](images/output-props.png?raw=true)

Check the documentation inside node-red **doc tab** of the output node for a quick guide of each configuraion field.

>__Caveat__: In this implementation only 40-bit (5-bytes) pipe numbers are supported as recommended by __nRF24L01__ manufacturer.

## nRF24L01 Mesh Networking

TODO Documentation ...

## nRF24L01 TCP/IP Networking Gateway

TODO Documentation ...

## Examples

In the folder examples there some example flows. You can access them via Node-RED
editor menu *Import>Examples>nrf24*.

## ToDo

- ~~Implement board profiles~~.
- Add Dynamic payload size.
- Implement TCP/IP Gateway node.
- Further test on Mesh node.
- ~~Implement IRQ in radio.~~
- Improve documentation.
- Add additional flow examples (mesh)
- ~~Document nodes for node red editor (HTML view).

## Change Log

- V0.3.0 Upgrade nrf24 0.2
  - Requires nodejs >12
  - Includes precompiled binaries.

- V0.2.0 Bump to nrf24 0.1.7
  - Static compilation of base libraries.
  - Added Tx delay
  - Change write queue to promises.

- V0.1.0 Update to new version of nrf24
  - Stream and async support.
  - Extra parameters on radio

- V0.0.3 Major update.
  - Update to nrf24 0.1.0

- V0.0.2 First release (Alpha version)
  - Radio config node with base logic to manage radios.
  - Input & output nodes
  - Mesh node
