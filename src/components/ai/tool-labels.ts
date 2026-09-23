/** Spanish names for every tool the copilot can call, shown in the transcript. */
export const toolLabels: Record<string, string> = {
  portfolioSummary: "Resumen de la cartera",
  findClients: "Buscar clientes",
  getClient: "Leer ficha de cliente",
  listLinks: "Leer enlaces",
  listImplementations: "Listar implementaciones",
  listPendings: "Listar pendientes",
  listInvoices: "Listar facturas",
  revenueSeries: "Leer series de Stripe",
  recentActivity: "Leer actividad",
  lezgoIaStatus: "Leer Lezgo IA",
  listSubAccounts: "Listar subcuentas",
  findContacts: "Buscar contactos",
  getContact: "Leer contacto",
  createContact: "Crear contacto",
  updateContact: "Actualizar contacto",
  deleteContact: "Eliminar contacto",
  tagContact: "Etiquetar contacto",
  listPipelines: "Listar pipelines",
  findOpportunities: "Buscar oportunidades",
  createOpportunity: "Crear oportunidad",
  updateOpportunity: "Actualizar oportunidad",
  deleteOpportunity: "Eliminar oportunidad",
  sendMessage: "Enviar mensaje",
  listWorkflows: "Listar automatizaciones",
  listCalendars: "Listar calendarios",
}

export const toolLabel = (type: string) => {
  const name = type.replace(/^tool-/, "")
  return toolLabels[name] ?? name
}
