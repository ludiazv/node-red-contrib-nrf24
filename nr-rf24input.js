'use strict';

module.exports = function(RED) {
  function RF24input(n) {
    RED.nodes.createNode(this,n);
    var node = this;
    //var context=this.context();

    node.pipeID=-1;
    node.pipeAddress=n.pipeaddress;
    node.autoAck=n.autoack;
    node.topic= n.topic || "";
    node.as_string=n.outputstring || false;
    node.radio=RED.nodes.getNode(n.radio);
    node.rxPck=0;

    // Rcv Handler
    node.rcv=function(data){
      var msg={_msgid:RED.util.generateId(),
               pipeID:node.pipeID,
               pipeAddress: node.pipeAddress,
               topic: node.topic,
               payload: (node.as_string) ? node.radio.convertToString(data) : data};
      node.send(msg);
      node.rxPck++;
      node.status({fill:"green",shape:"dot",text:"A:"+ node.pipeAddress + " /Rx:"+node.rxPck});
    };

    if(node.radio.radio_ok && !node.radio.is_locked()) {
      node.radio.use();
      node.pipeID=node.radio.registerReader(node.pipeAddress,node.autoAck,node.rcv);
      if(node.pipeID>=1){
        node.on('close',function(remove,done){
          node.radio.deregisterReader(node.pipeID);
          node.radio.release();
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
        this.status({fill:"red",shape:"ring",text:"RF24 not working or in use"});

  } // RF24input

  RED.nodes.registerType("RF24input",RF24input);
};
