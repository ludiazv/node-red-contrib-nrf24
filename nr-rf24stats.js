"use strict";

module.exports = function(RED) {
  
    function RF24stats(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        node.radio=RED.nodes.getNode(n.radio);
        node.topic= "" || "nrf24stats";


        // init node
        if(node.radio.radio_ok && !node.radio.is_locked()) {
            node.radio.use();
            node.on("input",function(msg) {
                
               if('payload' in msg && msg.payload=="reset"){
                   node.radio.resetStats();
                } else {
                    msg.payload=node.radio.stats();
                    node.send(msg);
               }
               return null;
            });
            node.on("close",function(remove,done){
                    node.radio.release();
                    node.log("Statistic node stopped, removed:" + remove);
                    done();
            });
            this.status({fill:"green",shape:"dot",text:""});
        } else
            this.status({fill:"red",shape:"ring",text:"RF24 not working or in use"});

    } // RF24stats
    RED.nodes.registerType("RF24stats",RF24stats);
};