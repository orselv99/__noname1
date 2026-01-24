interface AuthPasswordStrengthMeterProps {
  password: string;
}

export const AuthPasswordStrengthMeter = ({ password }: AuthPasswordStrengthMeterProps) => {
  const getStrength = (pass: string) => {
    let score = 0;
    if (!pass) return 0;
    if (pass.length > 6) score += 1;
    if (pass.length > 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const score = getStrength(password);
  const colors = ['bg-gray-700', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];
  const labels = ['Weak', 'Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'];

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>Password Strength</span>
        <span>{labels[score]}</span>
      </div>
      <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${colors[score]}`}
          style={{ width: `${(score / 5) * 100}%` }}
        ></div>
      </div>
    </div>
  );
};
