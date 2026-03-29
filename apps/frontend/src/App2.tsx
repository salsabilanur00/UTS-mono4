import { useEffect, useState } from "react"
import type { User, ApiResponse } from "shared"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

export default function App() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/users?key=learn`
      )

      if (!res.ok) {
        throw new Error("Gagal mengambil data user")
      }

      const data: ApiResponse<User[]> = await res.json()
      setUsers(data.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  return (
    <div className="flex justify-center p-10">

      <Card className="w-[600px]">
        <CardHeader>
          <CardTitle>User List</CardTitle>
        </CardHeader>

        <CardContent>

          <Button onClick={loadUsers} className="mb-4">
            Refresh
          </Button>

          {loading && (
            <p className="text-sm text-muted-foreground mb-2">Loading...</p>
          )}

          {error && (
            <p className="text-sm text-red-500 mb-2">{error}</p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {users.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">
                    Tidak ada data
                  </TableCell>
                </TableRow>
              )}

              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                </TableRow>
              ))}
            </TableBody>

          </Table>

        </CardContent>
      </Card>

    </div>
  )
}