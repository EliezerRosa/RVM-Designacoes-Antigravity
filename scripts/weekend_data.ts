export const weekendSchedule = [
  { date: '2026-10-18', pres: 'EDMILSON', leit: 'VICTOR' },
  { date: '2026-10-25', pres: 'ROGÉRIO', leit: 'FELIPE' },
  { date: '2026-11-01', pres: 'RENATO', leit: 'ALLAN ROGER' },
  { date: '2026-11-08', pres: 'EMERSON', leit: 'SAMUEL' },
  { date: '2026-11-15', pres: 'DIEGO', leit: 'DANIEL FIGUEIREDO' },
  { date: '2026-11-22', pres: 'DOMINGOS', leit: 'GABRIEL CAMILO' },
  { date: '2026-11-29', pres: 'DANIEL', leit: 'GABRIEL OLIVEIRA' },
  { date: '2026-12-06', pres: 'EDMARDO', leit: 'JAIRO' },
  { date: '2026-12-13', pres: 'JOSE LUIZ FOURAX', leit: 'LUAN S' },
  { date: '2026-12-20', pres: 'LOPES', leit: 'ANDRÉ LUIZ' },
  { date: '2026-12-27', pres: 'JÚNIOR FOURAX', leit: 'ERICK SEGAL' },
  { date: '2027-01-03', pres: 'SAMUEL', leit: 'RENATO' },
  { date: '2027-01-10', pres: 'DANIEL FIGUEIREDO', leit: 'ROGÉRIO' },
  { date: '2027-01-17', pres: 'ISRAEL', leit: 'EDMILSON' },
  { date: '2027-01-24', pres: 'RENATO', leit: 'EMERSON' },
  { date: '2027-01-31', pres: 'ROGÉRIO', leit: 'DIEGO' },
  { date: '2027-02-07', pres: 'EDMILSON', leit: 'DOMINGOS' },
  { date: '2027-02-14', pres: 'EMERSON', leit: 'VINICIUS' },
  { date: '2027-02-21', pres: 'DIEGO', leit: 'EDMARDO' },
  { date: '2027-02-28', pres: 'DOMINGOS', leit: 'JOSE LUIZ FOURAX' },
  { date: '2027-03-07', pres: 'VINICIUS', leit: 'FELIPE' },
  { date: '2027-03-14', pres: 'EDMARDO', leit: 'VICTOR' },
  { date: '2027-03-21', pres: 'JOSE LUIZ FOURAX', leit: 'SAMUEL' },
  { date: '2027-03-28', pres: 'SAMUEL', leit: 'JÚNIOR FOURAX' },
  { date: '2027-04-04', pres: 'EDMILSON', leit: 'LOPES' },
  { date: '2027-04-11', pres: 'LOPES', leit: 'LUAN S' }
];

export function mapBrother(name: string, role: 'pres' | 'leit') {
  switch (name) {
    case 'EDMILSON':
      return role === 'pres'
        ? { hg_id: 3296262, searchName: 'Edmilson', fullName: 'Edmilson Monteiro' }
        : { hg_id: 3331200, searchName: 'Edmilson Pessanha', fullName: 'Edmilson Pessanha' };
    case 'VICTOR':
      return { hg_id: 3331161, searchName: 'Victor Correa', fullName: 'Victor Correa' };
    case 'ROGÉRIO':
      return { hg_id: 2489454, searchName: 'Marcos Rogerio Oliveira', fullName: 'Marcos Rogério Oliveira' };
    case 'FELIPE':
      return { hg_id: 3331174, searchName: 'Felipe de Oliveira', fullName: 'Felipe de Oliveira' };
    case 'RENATO':
      return { hg_id: 2491349, searchName: 'Renato', fullName: 'Renato Oliveira' };
    case 'ALLAN ROGER':
      return { hg_id: 3331231, searchName: 'Allan Roger', fullName: 'Allan Roger' };
    case 'EMERSON':
      return { hg_id: 3296264, searchName: 'Emerson', fullName: 'Emerson França' };
    case 'SAMUEL':
      return { hg_id: 3331195, searchName: 'Samuel Almeida', fullName: 'Samuel Almeida' };
    case 'DIEGO':
      return { hg_id: 2491224, searchName: 'Diego F. Resmann', fullName: 'Diego Resmann' };
    case 'DANIEL FIGUEIREDO':
      return { hg_id: 3331181, searchName: 'Daniel Figueiredo', fullName: 'Daniel Figueiredo' };
    case 'DOMINGOS':
      return { hg_id: 3331221, searchName: 'Domingos Oliveira', fullName: 'Domingos Oliveira' };
    case 'GABRIEL CAMILO':
      return { hg_id: 3331167, searchName: 'Gabriel Fouraux', fullName: 'Gabriel Fouraux (Camilo)' };
    case 'DANIEL':
      return { hg_id: 3331222, searchName: 'Daniel Carneiro', fullName: 'Daniel Carneiro' };
    case 'GABRIEL OLIVEIRA':
      return { hg_id: 3331237, searchName: 'Gabriel Henrique', fullName: 'Gabriel Henrique Oliveira' };
    case 'EDMARDO':
      return { hg_id: 2491469, searchName: 'Edmardo', fullName: 'Edmardo Queiroz' };
    case 'JAIRO':
      return { hg_id: 3331160, searchName: 'Jairo Santos', fullName: 'Jairo Santos' };
    case 'JOSE LUIZ FOURAX':
      return { hg_id: 3331234, searchName: 'José Luiz Fouraux', fullName: 'José Luiz Fouraux' };
    case 'LUAN S':
      return { hg_id: 3331139, searchName: 'Luan Sabadim', fullName: 'Luan Sabadim' };
    case 'LOPES':
      return { hg_id: 3331236, searchName: 'Alexsandro Lopes', fullName: 'Alexsandro Lopes' };
    case 'ANDRÉ LUIZ':
      return { hg_id: 3331162, searchName: 'André Luiz', fullName: 'André Luiz' };
    case 'JÚNIOR FOURAX':
      return { hg_id: 3331203, searchName: 'Júnior Fouraux', fullName: 'Júnior Fouraux' };
    case 'ERICK SEGAL':
      return { hg_id: 3331192, searchName: 'Erick Segall', fullName: 'Erick Segall' };
    case 'ISRAEL':
      return { hg_id: 2491316, searchName: 'Israel', fullName: 'Israel Vieira' };
    case 'VINICIUS':
      return role === 'pres'
        ? { hg_id: 2491442, searchName: 'Marcos Vinícius', fullName: 'Marcos Vinícius' }
        : { hg_id: 3331233, searchName: 'Vinicius Pessanha', fullName: 'Vinicius Pessanha' };
    default:
      return null;
  }
}

