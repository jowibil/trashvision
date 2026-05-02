import { Navigate, Outlet} from 'react-router-dom';
import { getUserFromToken } from './tokenHelper';
import { ROLES, type Role, roleHierarchy } from '../types/roles';

const ProtectedRoute = ({ allowedRoles }: { allowedRoles: Role[] }) => {
  const user = getUserFromToken();
  const role = (user?.role?.toLowerCase() as Role) || ROLES.GUEST; 

  const isAllowed = allowedRoles.some((r)=>
  roleHierarchy[role] >= roleHierarchy[r]
  );

  return isAllowed ?  <Outlet /> : <Navigate to="/" />;
};

export default ProtectedRoute;