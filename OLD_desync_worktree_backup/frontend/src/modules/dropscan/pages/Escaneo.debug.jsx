/* Debug version of Escaneo.jsx with console logging for delete guide functionality */

const handleDeleteGuia = (tabId, guiaId) => {
  console.log('🔍 handleDeleteGuia called with:', { tabId, guiaId });
  const tab = tabs.find(t => t.tabId === tabId)
  console.log('Found tab:', tab);
  if (!tab) return
  const guia = tab.guias.find(g => g.id === guiaId)
  console.log('Found guia:', guia);
  if (!guia) return
  console.log('Setting deleteGuiaModal with:', { tabId, guiaId, guiaCodigo: guia.codigo_guia, posicion: guia.posicion });
  setDeleteGuiaModal({ tabId, guiaId, guiaCodigo: guia.codigo_guia, posicion: guia.posicion })
}