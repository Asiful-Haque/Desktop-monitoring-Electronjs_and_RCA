import { useEffect, useState } from "react";

export default function useAppData(API_BASE) {
  const [taskData, setTaskData] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currUser, setCurrUser] = useState(null);
  const [allUsers, setAllUsers] = useState({});
  const [token, setToken] = useState(null);

  const user_id = localStorage.getItem("user_id");

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/tasks/${user_id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) return [];
      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();
      const filteredTasks = Array.isArray(data?.tasks)
        ? data.tasks.filter(
            (task) => task.status !== "completed" && task.status !== "pending"
          )
        : [];

      setTaskData(filteredTasks);
      return filteredTasks;
    } catch (error) {
      console.error("Fetch tasks error:", error);
      return [];
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${user_id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      const raw = Array.isArray(data?.projects)
        ? data.projects
        : Array.isArray(data?.allprojects)
        ? data.allprojects
        : [];

      setProjects(
        raw.map((p) => ({
          project_id: p.project_id,
          project_name: p.project_name,
        }))
      );
    } catch (e) {
      console.error("Fetch projects error:", e);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      setAllUsers(data?.users || []);

      const uid = localStorage.getItem("user_id");
      if (uid && Array.isArray(data?.users)) {
        const me =
          data.users.find((u) => String(u.user_id) === String(uid)) || null;
        setCurrUser(me);

        const resolvedRole = (
          me?.role ||
          me?.user_role ||
          me?.role_name ||
          ""
        )
          .toString()
          .trim();
        if (resolvedRole) localStorage.setItem("user_role", resolvedRole);
      }
    } catch (e) {
      console.error("Fetch users error:", e);
    }
  };

  // Initial load
  useEffect(() => {
    window.electronAPI
      .getTokenCookie()
      .then((fetchedToken) => {
        if (fetchedToken) setToken(fetchedToken);
        fetchTasks();
        fetchProjects();
        fetchUsers();
      })
      .catch(() => {
        fetchTasks();
        fetchProjects();
        fetchUsers();
      });
    
      
  }, []);

  return {
    taskData,
    setTaskData,
    projects,
    setProjects,
    currUser,
    setCurrUser,
    allUsers,
    setAllUsers,
    token,
    setToken,

    fetchTasks,
    fetchProjects,
    fetchUsers,
  };
}
