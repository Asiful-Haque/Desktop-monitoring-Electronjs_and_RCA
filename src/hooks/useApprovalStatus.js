import { useEffect, useMemo, useState } from "react";

export default function useApprovalStatus({ API_BASE, currUser }) {
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");

  const approvalApiBase = `${API_BASE}/api/users`;

  const getRoleLower = () => {
    const fromUser = (
      currUser?.role ||
      currUser?.user_role ||
      currUser?.role_name ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();

    if (fromUser) return fromUser;

    return (localStorage.getItem("user_role") || "")
      .toString()
      .trim()
      .toLowerCase();
  };

  const isFreelancer = useMemo(() => getRoleLower() === "freelancer", [currUser]);

  async function fetchApprovalStatus(uid) {
    try {
      setApprovalLoading(true);
      setApprovalError("");

      const res = await fetch(
        `${approvalApiBase}/Time-sheet-approval/getLatestValue`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ user_id: Number(uid) }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Failed to fetch approval status");
      }

      const val = Number(json?.time_sheet_approval);
      const normalized = Number.isFinite(val) ? val : 0;
      setApprovalStatus(normalized === 1 ? 1 : normalized === 2 ? 2 : 0);
      return normalized === 0;
    } catch (e) {
      setApprovalError(e?.message || "Failed to fetch approval status");
      return false;
    } finally {
      setApprovalLoading(false);
    }
  }

  // auto refresh approval state for freelancers
  useEffect(() => {
    if (!currUser?.user_id) return;
    const roleLower = getRoleLower();
    if (roleLower === "freelancer") {
      fetchApprovalStatus(currUser.user_id);
    } else {
      setApprovalStatus(null);
      setApprovalError("");
    }
    
    
  }, [
    currUser?.user_id,
    currUser?.role,
    currUser?.user_role,
    currUser?.role_name,
  ]);

  const blockSelections = isFreelancer && approvalStatus === 1 && !approvalLoading;

  return {
    approvalStatus,
    approvalLoading,
    approvalError,
    fetchApprovalStatus,
    getRoleLower,
    isFreelancer,
    blockSelections,
  };
}
