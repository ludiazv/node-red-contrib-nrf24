module.exports = function(RED) {
  function RF24output(n) {
    RED.nodes.createNode(this,n);
    var node = this;

    node.pipeAddress=n.pipeaddress;
    node.radio=RED.nodes.getNode(n.radio);
    node.txPck=0;
    node.txFail=0;

    if(node.radio.radio_ok && !node.radio.is_locked()) {
      node.radio.use();
      node.on('input',function(msg) {
        var addr=("pipeAddressW" in msg) ? msg.pipeAddressW : node.pipeAddress;
        if(node.radio.write(node.radio.convertToBuffer(msg.payload),addr)) {
          node.txPck++;
        } else {
          node.txFail++;
          node.warn("RF24 could not send radio packet in " + addr);
        }
        var txf_ratio=node.txFail/(node.txFail+node.txPck);
        var color="green";
        var shape="dot";
        if(txf_ratio >0.75) {
           color="red";
           shape="ring";
        }
        else if(txf_ratio > 0.25) color="orange";
        node.status({fill:color,shape:shape,text:"A:"+ addr + "/ Tx:"+node.txPck +"/ Fr%=" + txf_ratio.toFixed(1)*100 +"%"});
      });
      node.on('close',function(remove,done){ // Destructor
        node.radio.release();
        done();
      });

      node.status({fill:"green",shape:"dot",text:"A:"+ node.pipeAddress});
    } else node.status({fill:"red",shape:"ring",text:"RF24 not working or in use"});

  }
  RED.nodes.registerType("RF24output",RF24output);
};
