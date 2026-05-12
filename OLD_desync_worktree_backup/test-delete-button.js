// Simple test to check if the delete button should be rendered
const testPermissions = {
  userRol: 'Supervisor', // Change this to test different roles
  canDelete: (permission) => {
    // Simulate permission checking
    return true; // or false to test
  }
};

const isSupervisor = ['Supervisor', 'Jefe', 'Administrador'].includes(testPermissions.userRol);
const canDeletePermission = testPermissions.canDelete('dropscan.escaneo');
const isNotFirstPosition = true; // i !== 0

console.log('User role:', testPermissions.userRol);
console.log('Is supervisor:', isSupervisor);
console.log('Can delete dropscan.escaneo:', canDeletePermission);
console.log('Is not first position:', isNotFirstPosition);
console.log('Button should render:', isNotFirstPosition && canDeletePermission && isSupervisor);