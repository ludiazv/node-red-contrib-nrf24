"use strict";

module.exports = function(RED) {
  
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

        // Update node status symbol
        var update_status=function(addrs){
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
        var get_async_wcallback= function(addr,msg,ack) {
            if(ack)
                return function(success,tx_ok,tx_b,req){                  
                        msg.rf24_ack=success;
                        node.send(msg); // propagate ack;
                        node.txPck+=tx_ok;
                        node.txFail+=req-tx_ok;
                        update_status(addr);};
            else return function(success,tx_ok,tx_b,req){
                         node.txPck+=tx_ok;
                         node.txFail+=req-tx_ok;
                         update_status(addr);};
        }
        // Init
        if(node.radio.radio_ok && !node.radio.is_locked()) {
            node.radio.use();
            node.on("input",function(msg) {
                // Manage inputs
                var addr=("pipeAddressW" in msg) ? msg.pipeAddressW : node.pipeAddress;
                var aAck=("pipeAckW" in msg) ? msg.pipeAck : node.autoack;
                aAck= (aAck) ? true: false; // force boolean
                var buffer=node.radio.convertToBuffer(msg.payload);
                if(buffer === null || buffer === undefined) {
                    node.error("Invalid payload to send over the radio");
                    return null;
                }
                // Write process
                if(aAck) msg.rf24_ack=false; // Default false as response
                switch(node.writemode) {
                    case 0: //sync write
                        let success;
                        if((success=node.radio.writeSync(buffer,addr,aAck))) {
                            node.txPck++;
                        } else{
                            node.txFail++;
                        }
                        if(aAck) msg.rf24_ack=success; // Update messge
                        update_status(addr);  // show status
                        if(aAck) node.send(msg);  // send sync to node-red
                        break;
                    case 1: // Async write
                    case 2: // stream;
                        let callback=get_async_wcallback(addr,msg,aAck);
                        node.radio.write(node.writemode,buffer,addr,aAck,callback,node.streamsize);
                        //if(!job_success) {
                        //    node.txFail++;
                        //    node.error("Async job could not be started.");
                        //}
                        break;
                    default:
                        node.error("Invalid writemode ->"+node.writemode);
                } // Switch
      
                return null;

            });
            // Relase node
            node.on("close",function(remove,done){ // Destructor
                node.log("output node stopped, removed:" + remove);
                node.radio.release();
                done();
            });
            var mode="async write";
            if(node.writemode==0) mode="sync write";
            if(mode.writemode==2) mode="async stream";
            node.log("Output Pipe address configured " + node.pipeAddress+"["+mode+"]");
            node.status({fill:"green",shape:"dot",text:"A:"+ node.pipeAddress});
        } else node.status({fill:"red",shape:"ring",text:"RF24 not working or in use"});

    }
    RED.nodes.registerType("RF24output",RF24output);
};
