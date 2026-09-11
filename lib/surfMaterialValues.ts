// Linear RGB, metalness, roughness from surfTheSpike.blend → assets.
// These flat inputs were replaced by a shared black texture in the old bake.
export const surfMaterialValues: Record<string, { color: [number, number, number]; metalness: number; roughness: number }> = {
  'GP9XL_Frame.001': { color: [0.1070024, 0.1070024, 0.1070024], metalness: 1, roughness: 0.078125 },
  'GP9XL_Back.001': { color: [0.0884848, 0.0884848, 0.0884848], metalness: 1, roughness: 0.5 },
  'GP9XL_Lens1.001': { color: [0.00282463, 0.00249577, 0.00838879], metalness: 0.472727, roughness: 0.204545 },
  'GP9XL_Black.001': { color: [0, 0, 0], metalness: 0, roughness: 1 },
  'GP9XL_Black2.001': { color: [0.1913488, 0.1913488, 0.1913488], metalness: 1, roughness: 0.3671875 },
  'GP9XL_Black3.001': { color: [0.0146529, 0.0146529, 0.0146529], metalness: 0, roughness: 1 },
  'GP9XL_Front.001': { color: [0, 0, 0], metalness: 0, roughness: 0.140625 },
  'GP9XL_Frontcam.001': { color: [0.00901767, 0.00901767, 0.00901767], metalness: 1, roughness: 0.5 },
  'GP9XL_Frontcam2.001': { color: [0.00099779, 0, 0.02909845], metalness: 0.809091, roughness: 0 },
  'GP9XL_Frontcam3.001': { color: [0, 0, 0], metalness: 0, roughness: 1 },
  'GP9XL1.001': { color: [0.0062439, 0.008463, 0.0154596], metalness: 0, roughness: 1 },
  'GP9XL3.001': { color: [0.558451, 0.326408, 0.00114573], metalness: 1, roughness: 0.517215 },
  'silver 1': { color: [0.8, 0.8, 0.8], metalness: 1, roughness: 0.2 },
  'silver 1.001': { color: [0.5543003, 0.5543003, 0.5543003], metalness: 1, roughness: 0.2 },
  'silver 2': { color: [0.373411, 0.373411, 0.373411], metalness: 1, roughness: 0.3 },
}
