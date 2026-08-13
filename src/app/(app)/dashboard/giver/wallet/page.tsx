import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function GiverWalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const walletUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { creditBalance: true },
  });

  const transactions = await prisma.creditTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Giver Wallet</h1>

      <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white shadow-md">
        <p className="text-sm uppercase tracking-wider font-medium opacity-80">Available Credit Balance</p>
        <p className="text-4xl font-extrabold mt-1">
          ${walletUser?.creditBalance.toFixed(2) ?? "0.00"}
        </p>
      </div>

      <div className="bg-white border rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions recorded yet.</p>
        ) : (
          <div className="divide-y">
            {transactions.map((tx) => (
              <div key={tx.id} className="py-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-semibold text-gray-800">{tx.type.replace("_", " ")}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <span className="font-bold">
                  {tx.amount.toNumber() < 0 ? "" : "+"}${tx.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}