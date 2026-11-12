/* Réinitialisation du cache si la version change (chargé avant tout le reste) */
(function(){
    var SW_VER="54";
    try{
      if(localStorage.getItem("batiazur_sw_ver")!==SW_VER){
        localStorage.setItem("batiazur_sw_ver",SW_VER);
        if("serviceWorker" in navigator){
          navigator.serviceWorker.getRegistrations().then(function(regs){
            var tasks=regs.map(function(r){return r.unregister();});
            if("caches" in window){
              tasks.push(caches.keys().then(function(keys){
                return Promise.all(keys.map(function(k){return caches.delete(k);}));
              }));
            }
            if(regs.length>0){Promise.all(tasks).then(function(){window.location.reload();});}
          });
        }
      }
    }catch(e){}
  })();
