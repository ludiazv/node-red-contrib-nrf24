#!/bin/bash

CWD=$(pwd)
echo "Testing npm link procedure"
echo "Unlinking node-red-contrib-nrf24 from node-red"
cd $HOME/.node-red
npm unlink node-red-contrib-nrf24 --no-save
cd $CWD/node-red-contrib-nrf24
echo "Unlinking nrf24 from node-red-contrib-nrf24"
npm unlink nrf24 --no-save
echo "unlinking all global nrf24 modules"
unlink $(npm root -g)/node-red-contrib-nrf24
unlink $(npm root -g)/nrf24
# also con be done with npm unlink in module directory this is faster

cd $CWD
echo "Linking all nrf24 npm modules...."
echo " -> nrf24 to global"
cd ../node-nrf24
npm link
cd ../node-red-contrib-nrf24
echo " -> nrf24 as local link for node-red-contrib-nrf24"
npm link nrf24 
echo " -> node-red-contrib-nrf24 to global"
npm link

echo "Linking to node-red"
cd $HOME/.node-red
npm link node-red-contrib-nrf24 
cd $CWD
echo "done!"

