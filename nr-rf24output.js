"use strict";

module.exports = function(RED) {
    
    const nrutil=require("./nr-util");

    function RF24output(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        node.pipeAddress= "" + n.pipeaddress;
        node.radio=RED.nodes.getNode(n.radio);
        node.topic= n.topic || "";
        node.autoack= (n.autoack === undefined) ? true : n.autoack;
        node.hidestats = (n.hidestats === undefined) ? false : n.hidestats;
        node.writemode= parseInt(n.writemode) || 0;
        node.streamsize= parseInt(n.streamsize) || 512;
        node.txPck=0;
        node.txFail=0;

        // Update node status symbol helper
        const update_status=function(addrs){
            let totalpck=node.txFail+node.txPck;
            let txf_ratio=node.txFail/totalpck;
            let color="green";
            let shape="dot";
            if(txf_ratio >0.75) {
                color="red";
                shape="ring";
            } else if(txf_ratio > 0.25) { shape="ring"; color="yellow";}
            var stats=(node.hidestats) ? "" : "/N:" + totalpck + "|Tx:"+node.txPck +"|" + (txf_ratio*100.0).toFixed(0) +"%";
            node.status({fill:color,shape:shape,text:"A:"+ addrs + stats});
        };
  
        // Init
        if(node.radio.radio_ok && !node.radio.is_locked()) {
            node.radio.use();
            node.on("input",function(msg,send,done) {
                // pre 1.0 compatibility
                send = send || function() { node.send.apply(node,arguments) }
                // Manage inputs
                var addr=("pipeAddressW" in msg) ? msg.pipeAddressW : node.pipeAddress;
                var aAck=("pipeAckW" in msg) ? msg.pipeAck : node.autoack;
                aAck= (aAck) ? true: false; // force boolean
                var buffer=nrutil.convertToBuffer(msg.payload);
                if(buffer === null || buffer === undefined) {
                    node.error("Invalid payload to send over the radio");
                    return null;
                }
                // Write process
                node.radio.write(node.mode,buffer,addr,aAck,node.streamsize).then( function(resp) {
                  msg.rf24_ack=resp.success;
                  if(node.topic!="") msg.topic=node.topic; // change topic if received
                  send(msg,false); // Propagate message without clonging
                  if(done) done(); // Notificate done in >1.0
                  node.txPck+=resp.tx_ok;
                  node.txFail+=resp.req-resp.tx_ok;
                  update_status(addr);  

                }).catch(s => node.warn(s) );
                return null;      
                
            });
            // Relase node
            node.on("close",function(remove,done){ // Destructor
                node.log("output node stopped, removed:" + remove);
                node.radio.release();
                done();
            });
            var mode="async write";
            if(node.writemode==node.radio.WRITE_SYNC) mode="sync write";
            if(mode.writemode==node.radio.WRITE_STREAM) mode="async stream";
            node.log("Output Pipe address configured " + node.pipeAddress+"["+mode+"]");
            node.status({fill:"green",shape:"dot",text:"A:"+ node.pipeAddress});
        } else node.status({fill:"red",shape:"ring",text:"RF24 not working or in use"});

    }
    RED.nodes.registerType("RF24output",RF24output);
};
