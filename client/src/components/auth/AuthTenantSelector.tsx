import { Building2, X } from 'lucide-react';

interface AuthTenantInfo {
  tenant_id: string;
  name: string;
}

interface AuthTenantSelectorProps {
  isOpen: boolean;
  tenants: AuthTenantInfo[];
  onSelect: (tenantId: string) => void;
  onClose: () => void;
}

export const AuthTenantSelector = ({ isOpen, tenants, onSelect, onClose }: AuthTenantSelectorProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-10 bg-zinc-900 rounded-xl flex flex-col overflow-hidden"
      style={{ animation: 'slideIn 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500" />
          Select Organization
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <p className="text-zinc-400 text-sm mb-4">
          Your email is registered with multiple organizations. Select one to continue:
        </p>

        <div className="space-y-2">
          {tenants.map((tenant) => (
            <button
              key={tenant.tenant_id}
              onClick={() => onSelect(tenant.tenant_id)}
              className="w-full flex items-center gap-3 p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500 rounded-lg transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-left">
                <div className="font-medium text-white">{tenant.name}</div>
                <div className="text-xs text-zinc-500">{tenant.tenant_id}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
