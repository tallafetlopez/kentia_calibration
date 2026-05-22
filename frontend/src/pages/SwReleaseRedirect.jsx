import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function SwReleaseRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [err, setErr] = useState(null);

  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    (async () => {
      try {
        // Try v1 directly first
        try {
          await api.get(`/v1/sw-releases/${id}`);
          navigate(`/software-releases/${id}/labels`, { replace: true });
          return;
        } catch {
          // Not a v1 id — resolve from legacy
        }

        const { data: legacy } = await api.get(`/software-releases/${id}`);
        const { data: v1List } = await api.get("/v1/sw-releases");
        let v1 = (v1List || []).find(
          r => r.identifier === legacy.software_release_identifier && r.version === legacy.version
        );
        if (!v1) {
          const { data } = await api.post("/v1/sw-releases", {
            identifier: legacy.software_release_identifier,
            version: legacy.version,
            supplier: legacy.supplier,
            description: legacy.description,
            ecu_id: legacy.ecu_id,
          });
          v1 = data;
        }
        navigate(`/software-releases/${v1._id || v1.id}/labels`, { replace: true });
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, [id]);

  if (err) return <div className="p-5 text-xs text-red-600">Error: {err}</div>;
  return <div className="p-5 text-xs text-gray-500">Resolving release...</div>;
}
