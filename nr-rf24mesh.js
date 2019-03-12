"use strict";
module.exports = function(RED) {


    function RF24mesh(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        node.nodeID=parseInt(n.nodeID);
        node.timeout=parseInt(n.timeout);
        node.clean_dhcp=n.cleandhcp || false;
        node.radio=RED.nodes.getNode(n.radio);
        node.in_rules=n.rules || [];
        //node.in_rules=[ { type:"0x00", max_len:70 } ];
        node.txFrames=0;
        node.rxFrames=0;
        var radio=node.radio; // quick access to radio

        // Inital check if used or not ready
        if(!radio.radio_ok || radio.is_locked() || radio.is_used()) {
            this.status({fill:"red",shape:"ring",text:"RF24 radio is not working or in use. Mesh node require exclusive access to the radio"});
            return;
        }

        try {
            // Create mesh object
            radio.lock_use();
            node.mesh=new radio.nrf24_module.nRF24Mesh(node.radio.nRF24,node.clean_dhcp);

            //  close the node stoping it (destructor)
            node.on("close",function() {
                node.mesh.stop();
                radio.unlock_use();
                node.log("R24Mesh node-red node stopped/removed");
            }); // Destructor

            // Start the mesh
            if(!node.mesh.begin(node.nodeID,node.timeout)) {
                node.log("ID:" + node.nodeID + " timeout:" + node.timeout);
                radio.unlock_use();
                this.status({fill:"red",shape:"ring",text:"Mesh could not be started"});
                return;
            }
            var banner=(node.nodeID ==0 ) ? "Master " : "Node ";

            // --

            // Register the input msg callback
            node.on("input",function(msg) {
                // Check if the msg is a Trigger for routes
                if("topic" in msg && msg.topic=="RF24MeshAddresses"){
                    msg.payload=node.mesh.getAddrList();
                    node.send([null,msg]); // Send the address routes over the 2nd output
                    return;
                }
                else { // Frame
                    if("payload" in msg && "nodeID" in msg.payload && "data" in msg.payload && "type" in msg.payload) {

                        if(!Number.isInteger(msg.payload.nodeID) || msg.payload.nodeID < 0 || msg.payload.nodeID > 255)
                        {
                            node.error("RF24Mesh Invalid destination node address it should be 0-255");
                            return null;
                        }
                        if(!(typeof msg.payload.type === "string") && !Number.isInteger(msg.payload.type) ){
                            node.error("RF24Mesh Invalid frame type it should an integer or string");
                            return null;
                        }
                        var type= (typeof msg.payload.type === "string") ? parseInt(msg.payload.type,16) : msg.payload.type;
                        if(isNaN(type) || type < 1 || type > 127) {
                            node.error("RF24Mesh Invalid frame type it should 0x01 to 0x7F value");
                            return null;
                        }
                        type="0x" + ((type>=16) ? type.toString(16) : "0"+ type.toString(16));
                        if(node.mesh.send(type,node.radio.convertToBuffer(msg.payload.data),msg.payload.nodeID)){
                            node.txFrames++;
                            node.status({fill:"green",shape:"dot",text:banner + "Rx:"+node.rxFrames+"/Tx:"+node.txFrames});
                            return null;
                        }else {
                            node.warn("RF24Mesh Failed to send frame to " + msg.payload.nodeID );
                            return null;
                        }
                    } else {
                        // Error fallback
                        node.error("RF24Mesh Invalid format of outgoing frames payload");
                        return null;
                    }
                } // Frame

            });// Input

            // Register incoming trafic rules defined in the node
            var b=true;
            for(var i=0;i < node.in_rules.length;i++){
                var len=parseInt(node.in_rules[i].max_len);
                if(isNaN(len)) len=32;
                node.log("Adding mesh rule => type:"+node.in_rules[i].type+ " max len:" + len);
                b=b && (node.mesh.filter(node.in_rules[i].type,len) >=0);
            }

            if(!b) return this.status({fill:"red",shape:"ring",text:"Could not add incomming rules"});
            //---
            banner+="listening ";
            // Initiate listing for incomming frames
            node.mesh.onRcv(function(header,data) {
                var msg={topic:"rf24mesh_frame",payload:{header:header,data:data}};
                node.rxFrames++;
                node.send([msg,null]); // Frames are reported on 1st output
                node.status({fill:"green",shape:"dot",text:banner + "Rx:"+node.rxFrames+"/ Tx:"+node.txFrames});
            },
            function(stopped,wanted,error_count) {
                if(error_count==0)
                    node.warn("RF24Mesh stopped:"+stopped+" wanted by user:"+wanted + " error_count:" + error_count);
                else
                    node.error("RF24Mesh stopped:"+stopped+" wanted by user:"+wanted + " error_count:" + error_count);
            });
            this.status({fill:"green",shape:"dot",text:banner});
            node.log("RF24Mesh mesh started as " + ((node.nodeID==0) ? "master" : "node") + " with " + node.in_rules.length + " rules for incomming frames");
            //---END
        } catch(err) {
            node.radio.unlock_use();
            node.error("RF24Mesh could not start the mesh ->" + err + " " + err.stack);
            this.status({fill:"red",shape:"ring",text:"Mesh could not be started"});
        }

    } // RF24Mesh

    // Register
    RED.nodes.registerType("RF24mesh",RF24mesh);

}; // Exports
