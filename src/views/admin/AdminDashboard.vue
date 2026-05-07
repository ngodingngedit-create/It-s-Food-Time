<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../../supabase'
import { formatPrice, translateStatus } from '../../utils/formatters'

const props = defineProps({
  currentUser: Object,
  menu: Array,
  categories: Array
})

const emit = defineEmits(['logout', 'refresh-products'])

const isDashboardLoading = ref(false)
const dashboardTransactions = ref([])
const activeDashboardTab = ref('transactions')

// Form states for adding/editing
const newProductForm = ref({
  name: '',
  description: '',
  category: 'Dish Utama',
  price: 0,
  stock: 0,
  variant: '',
  image_url: ''
})

const editingProduct = ref(null)
const isEditModalOpen = ref(false)

const fetchDashboardTransactions = async () => {
  isDashboardLoading.value = true
  try {
    const [transactions, customers] = await Promise.all([
      supabase.get('transactions'),
      supabase.get('customers')
    ])
    
    dashboardTransactions.value = transactions.map(t => {
      const customer = customers.find(c => c.customer_id === t.customer_id)
      return {
        ...t,
        customer_name: customer ? customer.name : 'Pelanggan'
      }
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    isDashboardLoading.value = false
  }
}

const handleAddProduct = async () => {
  if (!newProductForm.value.name || newProductForm.value.price <= 0) {
    alert('Nama produk dan harga harus diisi.')
    return
  }

  isDashboardLoading.value = true
  try {
    await supabase.post('products', {
      name: newProductForm.value.name,
      description: newProductForm.value.description,
      category: newProductForm.value.category,
      price: newProductForm.value.price,
      stock: newProductForm.value.stock,
      variant: newProductForm.value.variant
    })

    alert('Produk berhasil ditambahkan!')
    newProductForm.value = {
      name: '',
      description: '',
      category: 'Dish Utama',
      price: 0,
      stock: 0,
      variant: ''
    }
    emit('refresh-products')
    activeDashboardTab.value = 'manage-products'
  } catch (error) {
    console.error('Error adding product:', error)
    alert('Gagal menambahkan produk.')
  } finally {
    isDashboardLoading.value = false
  }
}

const handleDeleteProduct = async (id) => {
  if (!confirm('Apakah Anda yakin ingin menghapus produk ini?')) return
  try {
    await supabase.delete('products', `product_id=eq.${id}`)
    alert('Produk berhasil dihapus!')
    emit('refresh-products')
  } catch (err) {
    console.error('Delete error:', err)
    alert('Gagal menghapus produk')
  }
}

const openEditModal = (product) => {
  editingProduct.value = { ...product }
  isEditModalOpen.value = true
}

const handleUpdateProduct = async () => {
  try {
    const id = editingProduct.value.id
    const updateData = {
      name: editingProduct.value.name,
      description: editingProduct.value.desc,
      category: editingProduct.value.category,
      price: editingProduct.value.price,
      stock: editingProduct.value.stock
    }
    await supabase.patch('products', `product_id=eq.${id}`, updateData)
    alert('Produk berhasil diperbarui!')
    isEditModalOpen.value = false
    emit('refresh-products')
  } catch (err) {
    console.error('Update error:', err)
    alert('Gagal memperbarui produk')
  }
}

onMounted(() => {
  fetchDashboardTransactions()
})
</script>

<template>
  <div class="page-container">
    <div class="container dashboard-content">
      <div class="dashboard-header-ui animate-fade-up">
        <div class="user-greeting">
          <h1>Halo, {{ currentUser?.name || 'Admin' }}! 👋</h1>
          <p>Kelola pesanan bisnis kuliner Anda di sini.</p>
        </div>
        <div class="dashboard-header-actions">
          <div class="dashboard-tabs">
            <button class="tab-btn" :class="{ active: activeDashboardTab === 'transactions' }" @click="activeDashboardTab = 'transactions'">Transaksi</button>
            <button class="tab-btn" :class="{ active: activeDashboardTab === 'manage-products' }" @click="activeDashboardTab = 'manage-products'">Daftar Produk</button>
            <button class="tab-btn" :class="{ active: activeDashboardTab === 'add-product' }" @click="activeDashboardTab = 'add-product'">Tambah Produk</button>
          </div>
          <button class="btn btn-outline" @click="emit('logout')">Keluar</button>
        </div>
      </div>

      <!-- TAB: TRANSACTIONS -->
      <div v-if="activeDashboardTab === 'transactions'">
        <div class="dashboard-stats animate-fade-up delay-100">
          <div class="stat-card">
            <span class="stat-icon">💰</span>
            <div class="stat-info">
              <span class="stat-label">Total Pesanan</span>
              <span class="stat-value">{{ dashboardTransactions.length }}</span>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">✅</span>
            <div class="stat-info">
              <span class="stat-label">Menunggu</span>
              <span class="stat-value">{{ dashboardTransactions.filter(t => t.payment_status === 'pending').length }}</span>
            </div>
          </div>
        </div>

        <div class="recent-orders-section animate-fade-up delay-200">
          <h3>Transaksi Terkini</h3>
          <div v-if="isDashboardLoading" class="dashboard-loading">
            <div class="spinner"></div>
            <p>Memuat transaksi...</p>
          </div>
          <div v-else-if="dashboardTransactions.length > 0" class="orders-table-wrapper responsive-table">
            <table class="orders-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Pelanggan</th>
                  <th>Telepon</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Metode</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in dashboardTransactions" :key="t.transaction_id">
                  <td class="font-bold">{{ t.invoice_number }}</td>
                  <td>{{ t.customer_name }}</td>
                  <td>{{ t.phone }}</td>
                  <td>{{ t.email }}</td>
                  <td><span class="badge-status" :class="t.payment_status">{{ translateStatus(t.payment_status) }}</span></td>
                  <td class="capitalize">{{ t.payment_method }}</td>
                  <td class="date-cell">{{ new Date(t.created_at).toLocaleDateString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="empty-dashboard">
            <p>Belum ada transaksi ditemukan.</p>
          </div>
        </div>
      </div>
      
      <!-- TAB: MANAGE PRODUCTS -->
      <div v-else-if="activeDashboardTab === 'manage-products'" class="manage-products-container animate-fade-up">
        <div class="recent-orders-section">
          <div class="section-header-flex">
            <h3>Daftar Produk</h3>
            <p>{{ menu.length }} produk tersedia</p>
          </div>
          
          <div class="orders-table-wrapper responsive-table">
            <table class="orders-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Kategori</th>
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in menu" :key="item.id">
                  <td>
                    <div class="product-cell">
                      <img :src="item.img" class="mini-thumb" />
                      <span>{{ item.name }}</span>
                    </div>
                  </td>
                  <td><span class="badge-cat">{{ item.category }}</span></td>
                  <td>{{ formatPrice(item.price) }}</td>
                  <td>{{ item.stock }}</td>
                  <td>
                    <div class="action-btns-list">
                      <button class="btn-icon-small edit" @click="openEditModal(item)">✎</button>
                      <button class="btn-icon-small delete" @click="handleDeleteProduct(item.id)">✕</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB: ADD PRODUCT -->
      <div v-else-if="activeDashboardTab === 'add-product'" class="add-product-container animate-fade-up">
        <div class="admin-form-card">
          <h3>Tambah Produk Baru</h3>
          <form @submit.prevent="handleAddProduct" class="admin-form">
            <div class="admin-form-grid">
              <div class="form-group">
                <label>Nama Produk</label>
                <input type="text" v-model="newProductForm.name" placeholder="misal: Sate Ayam" required />
              </div>
              <div class="form-group">
                <label>Kategori</label>
                <select v-model="newProductForm.category">
                  <option v-for="cat in categories.filter(c => c !== 'Semua')" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>Harga (IDR)</label>
                <input type="number" v-model="newProductForm.price" placeholder="15000" required />
              </div>
              <div class="form-group">
                <label>Stok</label>
                <input type="number" v-model="newProductForm.stock" placeholder="10" required />
              </div>
            </div>
            <div class="form-group">
              <label>Deskripsi</label>
              <textarea v-model="newProductForm.description" placeholder="Deskripsi singkat produk..." rows="3"></textarea>
            </div>
            <div class="form-group">
              <label>Varian / Catatan</label>
              <input type="text" v-model="newProductForm.variant" placeholder="misal: Ekstra Pedas, Besar, dll." />
            </div>

            <button type="submit" class="btn btn-primary" :disabled="isDashboardLoading">
              {{ isDashboardLoading ? 'Menambahkan...' : 'Simpan Produk' }}
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- EDIT PRODUCT MODAL -->
    <div class="modal-overlay" v-if="isEditModalOpen" @click.self="isEditModalOpen = false">
      <div class="edit-modal-card">
        <div class="modal-header">
          <h3>Edit Produk</h3>
          <button class="close-modal" @click="isEditModalOpen = false">×</button>
        </div>
        <form @submit.prevent="handleUpdateProduct" class="admin-form">
          <div class="admin-form-grid">
            <div class="form-group">
              <label>Nama Produk</label>
              <input type="text" v-model="editingProduct.name" required />
            </div>
            <div class="form-group">
              <label>Kategori</label>
              <select v-model="editingProduct.category">
                <option v-for="cat in categories.filter(c => c !== 'Semua')" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Harga (IDR)</label>
              <input type="number" v-model="editingProduct.price" required />
            </div>
            <div class="form-group">
              <label>Stok</label>
              <input type="number" v-model="editingProduct.stock" required />
            </div>
          </div>
          <div class="form-group">
            <label>Deskripsi</label>
            <textarea v-model="editingProduct.desc" rows="3"></textarea>
          </div>

          <button type="submit" class="btn btn-primary w-full">Perbarui Produk</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-content {
  padding-top: 3rem;
  padding-bottom: 5rem;
}
.dashboard-header-ui {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.dashboard-header-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.dashboard-tabs {
  display: flex;
  background: #f1f5f9;
  padding: 0.4rem;
  border-radius: var(--radius-md);
  gap: 0.25rem;
}
.tab-btn {
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-light);
  transition: all 0.2s;
}
.tab-btn.active {
  background: white;
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

/* Manage Products Styles */
.product-cell {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.mini-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}
.badge-cat {
  background: #f1f5f9;
  color: #64748b;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.action-btns-list {
  display: flex;
  gap: 0.5rem;
}
.btn-icon-small {
  width: 32px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s;
}
.btn-icon-small.edit {
  background: #f1f5f9;
  color: #64748b;
}
.btn-icon-small.delete {
  background: #fef2f2;
  color: #ef4444;
}
.btn-icon-small:hover {
  transform: scale(1.1);
}

/* Stats */
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}
.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 1.25rem;
  transition: transform 0.3s;
}
.stat-card:hover {
  transform: translateY(-5px);
}
.stat-icon {
  font-size: 2rem;
}
.stat-label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-light);
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.stat-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-dark);
}

/* Table */
.recent-orders-section {
  background: white;
  padding: 2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
.recent-orders-section h3 {
  margin-bottom: 1.5rem;
}
.orders-table-wrapper {
  overflow-x: auto;
}
.orders-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.orders-table th {
  padding: 1rem;
  font-weight: 700;
  color: var(--text-light);
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.orders-table td {
  padding: 1.25rem 1rem;
  border-bottom: 1px solid #f8fafc;
  font-size: 0.9rem;
}
.badge-status {
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
}
.badge-status.pending { background: #fffbeb; color: #d97706; }
.badge-status.success { background: #f0fdf4; color: #16a34a; }
.badge-status.failed { background: #fef2f2; color: #dc2626; }

/* Admin Form */
.admin-form-card {
  background: white;
  padding: 2.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  max-width: 800px;
  margin: 0 auto;
}
.admin-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}
.admin-form .form-group {
  margin-bottom: 1.25rem;
}
.admin-form label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-dark);
  font-size: 0.9rem;
}
.admin-form input, .admin-form select, .admin-form textarea {
  width: 100%;
  padding: 0.8rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 0.95rem;
  transition: all 0.2s;
}
.admin-form input:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

/* Modal Edit */
.edit-modal-card {
  background: white;
  padding: 2.5rem;
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 650px;
  position: relative;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

@media (max-width: 768px) {
  .dashboard-header-ui {
    flex-direction: column;
    align-items: flex-start;
  }
  .admin-form-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-header-actions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
