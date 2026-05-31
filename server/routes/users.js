import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { listUsers, setAdminOverride, removeUser } from '../userRegistry.js';

export default function usersRoutes() {
  const router = Router();

  // All user-management routes are admin-only.
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    try {
      res.json(listUsers());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.patch('/:id', (req, res) => {
    try {
      const { isAdmin } = req.body || {};
      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'isAdmin must be a boolean' });
      }
      res.json(setAdminOverride(req.params.id, isAdmin));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      res.json(removeUser(req.params.id));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}
