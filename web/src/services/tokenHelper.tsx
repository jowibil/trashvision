import { jwtDecode } from "jwt-decode";

type TokenPayload = {
  role: string;
  name: string;
  sub: string;
};

export const getUserFromToken = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    return jwtDecode<TokenPayload>(token);
  } catch {
    return null;
  }
};
