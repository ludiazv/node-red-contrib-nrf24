"use strict";

module.exports = function(RED) {
    
    const nrutil=require("./nr-util");

    function RF24input(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        
        node.pipeID=-1;
        node.pipeAddress="" + n.pipeaddress;
        node.autoAck=(n.autoack === undefined) ? true : n.autoack;
        node.topic= n.topic || "nrf24";
        node.as_string= (n.outputstring  === undefined) ? true : n.outputstring;
        node.radio=RED.nodes.getNode(n.radio);
        node.mergeframes= parseInt(n.mergeframes) || 1;
        node.mergetimeout= parseInt(n.mergetimeout) || 1000;
        node.hidestats= (n.hidestats === undefined ) ? false : n.hidestats;
      
        // Rcv Handler
        var mergeBuff=Buffer.alloc(0);
        const mergeSize= node.mergeframes * node.radio.nrf24_configuration.PayloadSize;
        var timeoutControl=null;
        var emitter=function() {
            if(timeoutControl!=null) {
                clearTimeout(timeoutControl); // clear the timeout
                timeoutControl=null;
            }
            if(mergeBuff.length>0) {
                var data=Buffer.from(mergeBuff); // copy the buffer
                mergeBuff=Buffer.alloc(0); // reset mergeBuff
                var msg={_msgid:RED.util.generateId(),
                    pipeID:node.pipeID,
                    pipeAddress: node.pipeAddress,
                    topic: node.topic,
                    payload: (node.as_string) ? nrutil.convertToString(data) : data
                };
                node.send(msg,false);
            }
        };
        // Receive callaback
        node.rcv=function(data,rxStat){
            if(timeoutControl==null && node.mergeframes> 1) { // If no timeout set programm itº
                timeoutControl=setTimeout(emitter,node.mergetimeout);
            }
            mergeBuff=Buffer.concat([mergeBuff,data],mergeBuff.length+data.length);
            if(mergeBuff.length >= mergeSize || node.mergeframes==1) emitter();
            var stats=(node.hidestats) ? "" : "|Rx:"+rxStat;
            node.status({fill:"green",shape:"dot",text:"A:"+ node.pipeAddress + stats });
        };

        if(node.radio.radio_ok && !node.radio.is_locked()) {
            node.radio.use();
            node.pipeID=node.radio.registerReader(node.pipeAddress,node.autoAck,node.rcv,node.mergeframes);
            if(node.pipeID>=1){
                node.on("close",function(remove,done){
                    node.radio.deregisterReader(node.pipeID);
                    node.radio.release();
                    node.log("input node stopped, removed:" + remove);
                    done();
                });
                this.status({fill:"green",shape:"dot",text:"A:"+ node.pipeAddress});
            }
            else{
                node.pipeID=-1;
                this.status({fill:"red",shape:"ring",text:"Could not open Reading pipe " + node.pipeAddress});
                node.radio.release();
            }
        } else
            this.status({fill:"red",shape:"ring",text:"RF24 radio not working or in use"});

    } // RF24input

    RED.nodes.registerType("RF24input",RF24input);
};
