import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { MoreVertical } from "lucide-react";
import { Shield } from "lucide-react";
import { User } from "lucide-react";
import { UserPlus } from "lucide-react";
import { Trash2 } from "lucide-react";
import { Ban } from "lucide-react";
import { Loader2 } from "lucide-react";
import { getUserFromToken } from "../services/tokenHelper";
import { ROLES } from "../types/roles";

// Delight-tier mount animation for the row action menu and delete modal
// (Settings is the prescription's delight-budget page, so chrome motion is
// allowed here — still ≤200ms ease-out and reduced-motion gated).
const POP_IN_CSS = `
@keyframes tv-pop-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.tv-pop-in { animation: tv-pop-in 150ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@media (prefers-reduced-motion: reduce) { .tv-pop-in { animation: none; } }
`;

// Based on actual field usage below (user_id, name, email, role) rather
// than the previous `any[]`.
interface ManagedUser {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

export default function UserManagement() {
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentUser = getUserFromToken();
  const myId = currentUser?.sub;

  useEffect(() => {
    const controller = new AbortController();

    const fetchUsers = async () => {
      try {
        const res = await api.get("auth/users/", { signal: controller.signal });

        const sortedUsers: ManagedUser[] = [...res.data].sort((a: ManagedUser, b: ManagedUser) => {
          if (a.role === ROLES.ADMIN && b.role !== ROLES.ADMIN) return -1;
          if (a.role !== ROLES.ADMIN && b.role === ROLES.ADMIN) return 1;

          if (a.user_id === myId) return -1;
          if (b.user_id === myId) return 1;

          return 0;
        });

        setUsers(sortedUsers);
      } catch {
        // ... error handling
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    return () => controller.abort();
  }, [myId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeMenu]);

  const handleRoleUpdate = async (userId: string, currentRole: string) => {
    const newRole = currentRole === ROLES.ADMIN ? ROLES.COMMUNITY : ROLES.ADMIN;

    try {
      await api.patch(`auth/users/${userId}`, { role: newRole });

      setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));

      toast.success(`User role updated to ${newRole}`);
    } catch {
      toast.error("Failed to update permission");
    } finally {
      setActiveMenu(null);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);

    try {
      await api.delete(`auth/users/${userToDelete.id}`);
      setUsers((prev) => prev.filter((u) => u.user_id !== userToDelete.id));
      toast.success(`${userToDelete.name} has been removed`);
      setUserToDelete(null);
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 bg-[#fcfcfc] rounded-2xl shadow-sm border border-slate-100 max-w-5xl mx-auto mt-6">
      <style>{POP_IN_CSS}</style>
      <div className="flex justify-between items-center mb-8">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight mb-2">User Management</h3>
          <p className="text-slate-500 text-sm font-medium">Manage community roles and system permissions</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-500 tabular-nums" aria-label={`${users.length} users total`}>
          {users.length} users
        </div>
      </div>

      {loading ? (
        // Skeleton mirrors the table's row layout so nothing jumps when data
        // arrives (replaces the generic spinner, per Dashboard precedent).
        <div className="space-y-3 py-2" role="status" aria-label="Loading users">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-[#fcfcfc] border border-slate-100 rounded-xl shadow-sm" aria-hidden="true">
              <div className="h-10 w-10 rounded-full bg-slate-100 animate-pulse motion-reduce:animate-none" />
              <div className="space-y-2 flex-1">
                <div className="h-3.5 w-44 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                <div className="h-3 w-32 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="h-6 w-24 rounded-lg bg-slate-100 animate-pulse motion-reduce:animate-none" />
              <div className="h-9 w-9 rounded-lg bg-slate-100 animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        // First-run empty state: what will appear here.
        <div className="flex flex-col items-center text-center py-16">
          <div className="p-4 bg-blue-50 text-[#005D90] rounded-2xl mb-3">
            <UserPlus size={24} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-slate-700">No users yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            People who register for TrashVision will show up here once they're approved.
          </p>
        </div>
      ) : (
        <div className="overflow-visible">
          <table className="w-full text-left border-separate border-spacing-y-2">
            <thead>
              <tr className="text-slate-400 text-xs font-bold tracking-wide">
                <th scope="col" className="pb-2 pl-4 text-left font-bold">User details</th>
                <th scope="col" className="pb-2 text-left font-bold">Permission level</th>
                <th scope="col" className="pb-2 text-right pr-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isMe = user.user_id === myId;
                const isAdmin = user.role === ROLES.ADMIN;

                return (
                  <tr
                    key={user.user_id}
                    className={`bg-[#fcfcfc] border border-slate-100 rounded-xl shadow-sm hover:bg-slate-50 transition-colors duration-150 ease-out motion-reduce:transition-none ${isMe ? "ring-1 ring-blue-100" : ""}`}
                  >
                    <td className="py-4 pl-4 rounded-l-xl">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ${isMe ? "bg-[#005D90]" : "bg-gradient-to-br from-slate-400 to-slate-600"}`}
                        aria-hidden="true"
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-700">{user.name}</p>
                            {isMe ? (
                              <span className="text-[10px] bg-blue-100 text-[#005D90] px-1.5 py-0.5 rounded font-bold">You</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold ${
                          isAdmin ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        }`}
                      >
                        {isAdmin ? <Shield size={12} aria-hidden="true" /> : <User size={12} aria-hidden="true" />}
                        {isAdmin ? "Admin" : "Community"}
                      </span>
                    </td>

                    <td className="py-4 text-right pr-4 rounded-r-xl relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === user.user_id ? null : user.user_id);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
                        aria-label={`Actions for ${user.name}`}
                        aria-expanded={activeMenu === user.user_id}
                        aria-haspopup="menu"
                      >
                        <MoreVertical size={20} aria-hidden="true" />
                      </button>

                      {activeMenu === user.user_id ? (
                        <div
                          ref={menuRef}
                          role="menu"
                          aria-label={`Actions for ${user.name}`}
                          className="absolute right-4 mt-2 w-52 bg-[#fcfcfc] border border-slate-100 rounded-xl shadow-2xl z-50 py-1 tv-pop-in"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            disabled={isMe}
                            onClick={() => handleRoleUpdate(user.user_id, user.role)}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors duration-150 ease-out motion-reduce:transition-none ${isMe ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:-outline-offset-2"}`}
                          >
                            <Shield size={16} aria-hidden="true" />
                            {isAdmin ? "Demote to Community" : "Promote to Admin"}
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            className="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:-outline-offset-2 motion-reduce:transition-none"
                          >
                            <Ban size={16} aria-hidden="true" /> Suspend access
                          </button>

                          <div className="h-px bg-slate-50 my-1 mx-2" />

                          <button
                            type="button"
                            role="menuitem"
                            disabled={isMe}
                            onClick={() => {
                              setUserToDelete({ id: user.user_id, name: user.name });
                              setActiveMenu(null);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors duration-150 ease-out motion-reduce:transition-none ${isMe ? "text-slate-300 cursor-not-allowed" : "text-red-600 hover:bg-red-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-600 focus-visible:-outline-offset-2"}`}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                            {isMe ? "Cannot delete self" : "Delete account"}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {userToDelete ? (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm tv-pop-in"
            onClick={() => setUserToDelete(null)}
            aria-hidden="true"
          />

  

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
            className="relative bg-[#fcfcfc] w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 tv-pop-in"
          >
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mb-4">
              <Trash2 className="text-red-600" size={24} aria-hidden="true" />
            </div>

            <h3 id="delete-user-title" className="text-xl font-bold text-slate-800 mb-2">Delete user?</h3>
            <p className="text-slate-500 mb-6 text-sm leading-relaxed">
              Are you sure you want to remove{" "}
              <span className="font-bold text-slate-700">{userToDelete.name}</span>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors duration-150 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-[#005D90] focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-red-600 focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {isDeleting ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}