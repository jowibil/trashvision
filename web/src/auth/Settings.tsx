import { useState, useEffect, useRef } from "react";
import api from "../api/axios";
import toast from "react-hot-toast";
import { MoreVertical, Shield, User, Trash2, Ban, Loader2 } from "lucide-react";
import { getUserFromToken } from "../services/tokenHelper";
import { ROLES } from "../types/roles";

export default function UserManagement() {
  const [userToDelete, setUserToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for User List and UI
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentUser = getUserFromToken();
  const myId = currentUser?.sub;

  // 1. Fetch Users on Mount
  useEffect(() => {
    const controller = new AbortController();

    // Inside your fetchUsers function
    const fetchUsers = async () => {
      try {
        const res = await api.get("auth/users/", { signal: controller.signal });


        const sortedUsers = res.data.sort((a: any, b: any) => {
          if (a.role === ROLES.ADMIN && b.role !== ROLES.ADMIN) return -1;
          if (a.role !== ROLES.ADMIN && b.role === ROLES.ADMIN) return 1;

          if (a.user_id === myId) return -1;
          if (b.user_id === myId) return 1;

          return 0;
        });

        setUsers(sortedUsers);
      } catch (err: any) {
        // ... error handling
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    return () => controller.abort();
  }, []);

  // 2. Click Outside Handler for Action Menus
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

  // 3. Update User Role (Admin <-> Community)
  const handleRoleUpdate = async (userId: string, currentRole: string) => {
    const newRole = currentRole === ROLES.ADMIN ? ROLES.COMMUNITY : ROLES.ADMIN;

    try {
      await api.patch(`auth/users/${userId}`, { role: newRole });

      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)),
      );

      toast.success(`User role updated to ${newRole}`);
    } catch (err) {
      toast.error("Failed to update permission");
    } finally {
      setActiveMenu(null);
    }
  };

  // 4. Actual API Call for Deletion
  const confirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);

    try {
      await api.delete(`auth/users/${userToDelete.id}`);
      setUsers((prev) => prev.filter((u) => u.user_id !== userToDelete.id));
      toast.success(`${userToDelete.name} has been removed`);
      setUserToDelete(null);
    } catch (err) {
      toast.error("Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 max-w-5xl mx-auto mt-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="text-left">
          <h3 className="text-3xl font-black text-[#005D90] tracking-tight mb-2">
            User Management
          </h3>
          <p className="text-slate-500 text-sm font-medium">
            Manage community roles and system permissions
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-400">
          TOTAL USERS: {users.length}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mb-2" />
          <p>Syncing TrashVision Users...</p>
        </div>
      ) : (
        <div className="overflow-visible">
          <table className="w-full text-left border-separate border-spacing-y-2">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-tighter px-4">
                <th className="pb-2 pl-4">User Details</th>
                <th className="pb-2">Permission Level</th>
                <th className="pb-2 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isMe = user.user_id === myId;
                const isAdmin = user.role === ROLES.ADMIN;

                return (
                  <tr
                    key={user.user_id}
                    className={`bg-white hover:bg-slate-50 border border-slate-100 transition-all rounded-xl shadow-sm ${isMe ? "ring-1 ring-blue-100" : ""}`}
                  >
                    <td className="py-4 pl-4 rounded-l-xl">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm ${isMe ? "bg-blue-600" : "bg-gradient-to-br from-slate-400 to-slate-600"}`}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-700">
                              {user.name}
                            </p>
                            {isMe && (
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase font-black">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide ${
                          isAdmin
                            ? "bg-purple-50 text-purple-600 border border-purple-100"
                            : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        }`}
                      >
                        {isAdmin ? <Shield size={12} /> : <User size={12} />}
                        {user.role}
                      </span>
                    </td>

                    <td className="py-4 text-right pr-4 rounded-r-xl relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(
                            activeMenu === user.user_id ? null : user.user_id,
                          );
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                      >
                        <MoreVertical size={20} />
                      </button>

                      {activeMenu === user.user_id && (
                        <div
                          ref={menuRef}
                          className="absolute right-4 mt-2 w-52 bg-white border border-slate-100 rounded-xl shadow-2xl z-50 py-1 animate-in fade-in zoom-in duration-100"
                        >
                          <button
                            disabled={isMe}
                            onClick={() =>
                              handleRoleUpdate(user.user_id, user.role)
                            }
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${isMe ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-slate-50"}`}
                          >
                            <Shield size={16} />
                            {isAdmin
                              ? "Demote to Community"
                              : "Promote to Admin"}
                          </button>

                          <button className="w-full px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-3">
                            <Ban size={16} /> Suspend Access
                          </button>

                          <div className="h-px bg-slate-50 my-1 mx-2" />

                          {/* Delete Trigger - Sets state to open modal */}
                          <button
                            disabled={isMe}
                            onClick={() => {
                              setUserToDelete({
                                id: user.user_id,
                                name: user.name,
                              });
                              setActiveMenu(null);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${isMe ? "text-slate-300 cursor-not-allowed" : "text-red-600 hover:bg-red-50"}`}
                          >
                            <Trash2 size={16} />
                            {isMe ? "Cannot Delete Self" : "Delete Account"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modern Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setUserToDelete(null)}
          />

          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mb-4">
              <Trash2 className="text-red-600" size={24} />
            </div>

            <h3 className="text-xl font-bold text-slate-800 mb-2">
              Delete User?
            </h3>
            <p className="text-slate-500 mb-6 text-sm leading-relaxed">
              Are you sure you want to remove{" "}
              <span className="font-bold text-slate-700">
                {userToDelete.name}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setUserToDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Confirm Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
