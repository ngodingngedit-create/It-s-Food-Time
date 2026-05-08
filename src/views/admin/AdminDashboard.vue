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
  price: 0,
  stock: 0,
  variant: '',
  image_url: ''
})

const editingProduct = ref(null)
const isEditModalOpen = ref(false)

// Image Upload State
const isUploading = ref(false)
const selectedAddFile = ref(null)
const addPreviewUrl = ref(null)
const selectedEditFile = ref(null)
const editPreviewUrl = ref(null)

const handleFileChange = (e, type) => {
  const file = e.target.files[0]
  if (!file) return

  // Validation
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    alert('Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.')
    return
  }

  if (type === 'add') {
    selectedAddFile.value = file
    addPreviewUrl.value = URL.createObjectURL(file)
  } else {
    selectedEditFile.value = file
    editPreviewUrl.value = URL.createObjectURL(file)
  }
}

const uploadImage = async (file) => {
  if (!file) return null
  
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `products/${fileName}`

  const { data, error } = await supabase.storage
    .from('products')
    .upload(filePath, file)

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from('products')
    .getPublicUrl(filePath)

  return publicUrl
}

const fetchDashboardTransactions = async () => {
  isDashboardLoading.value = true
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(*)')
      .order('created_at', { ascending: false })
    
    if (error) throw error

    dashboardTransactions.value = data.map(t => ({
      ...t,
      customer_name: t.customers?.full_name || 'Pelanggan',
      phone: t.customers?.phone || '-',
      email: t.customers?.email || '-'
    }))
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    isDashboardLoading.value = false
  }
}

const updateOrderStatus = async (orderId, newStatus) => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ order_status: newStatus })
      .eq('id', orderId)
    
    if (error) throw error
    
    // Update local state
    const order = dashboardTransactions.value.find(t => t.id === orderId)
    if (order) order.order_status = newStatus
    
    alert('Status pesanan diperbarui!')
  } catch (error) {
    console.error('Error updating status:', error)
    alert('Gagal memperbarui status.')
  }
}

const handleAddProduct = async () => {
  if (!newProductForm.value.name || newProductForm.value.price <= 0) {
    alert('Nama produk dan harga harus diisi.')
    return
  }

  isDashboardLoading.value = true
  isUploading.value = true
  try {
    let finalImageUrl = newProductForm.value.image_url || '/logo/logo1.png'

    // 1. Upload image if selected
    if (selectedAddFile.value) {
      const uploadedUrl = await uploadImage(selectedAddFile.value)
      if (uploadedUrl) finalImageUrl = uploadedUrl
    }

    // 2. Save product
    const { error } = await supabase.from('products').insert([
      {
        product_name: newProductForm.value.name,
        description: newProductForm.value.description,
        price: newProductForm.value.price,
        stock_qty: newProductForm.value.stock,
        image_url: finalImageUrl
      }
    ])

    if (error) throw error

    alert('Produk berhasil ditambahkan!')
    newProductForm.value = {
      name: '',
      description: '',
      price: 0,
      stock: 0,
      variant: '',
      image_url: ''
    }
    selectedAddFile.value = null
    addPreviewUrl.value = null
    emit('refresh-products')
    activeDashboardTab.value = 'manage-products'
  } catch (error) {
    console.error('Error adding product:', error)
    alert('Gagal menambahkan produk: ' + error.message)
  } finally {
    isDashboardLoading.value = false
    isUploading.value = false
  }
}

const handleDeleteProduct = async (id) => {
  if (!confirm('Apakah Anda yakin ingin menghapus produk ini?')) return
  try {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
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
  isUploading.value = true
  try {
    let finalImageUrl = editingProduct.value.img
    
    // 1. Upload new image if selected
    if (selectedEditFile.value) {
      const uploadedUrl = await uploadImage(selectedEditFile.value)
      if (uploadedUrl) finalImageUrl = uploadedUrl
    }

    const id = editingProduct.value.id
    const updateData = {
      product_name: editingProduct.value.name,
      description: editingProduct.value.desc,
      price: editingProduct.value.price,
      stock_qty: editingProduct.value.stock,
      image_url: finalImageUrl
    }
    const { error } = await supabase.from('products').update(updateData).eq('id', id)
    if (error) throw error
    
    alert('Produk berhasil diperbarui!')
    selectedEditFile.value = null
    editPreviewUrl.value = null
    isEditModalOpen.value = false
    emit('refresh-products')
  } catch (err) {
    console.error('Update error:', err)
    alert('Gagal memperbarui produk: ' + err.message)
  } finally {
    isUploading.value = false
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
              <span class="stat-value">{{ dashboardTransactions.filter(t => t.order_status === 'pending').length }}</span>
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
                <tr v-for="t in dashboardTransactions" :key="t.id">
                  <td class="font-bold">{{ t.invoice_number }}</td>
                  <td>{{ t.customer_name }}</td>
                  <td>{{ t.phone }}</td>
                  <td>{{ t.email }}</td>
                  <td>
                    <select 
                      :value="t.order_status" 
                      @change="updateOrderStatus(t.id, $event.target.value)"
                      class="status-select"
                      :class="t.order_status"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
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
            <div class="form-group">
              <label>Upload Gambar Produk</label>
              <input type="file" @change="handleFileChange($event, 'add')" accept="image/*" class="file-input" />
              <div v-if="addPreviewUrl" class="image-preview-container">
                <img :src="addPreviewUrl" class="image-preview" />
                <p class="preview-label">Preview Gambar Baru</p>
              </div>
            </div>
            <div class="form-group">
              <label>Atau URL Gambar (Opsional)</label>
              <input type="text" v-model="newProductForm.image_url" placeholder="https://..." />
            </div>

            <button type="submit" class="btn btn-primary" :disabled="isDashboardLoading || isUploading">
              {{ isUploading ? 'Mengunggah Gambar...' : (isDashboardLoading ? 'Menambahkan...' : 'Simpan Produk') }}
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
          <div class="form-group">
            <label>Ganti Gambar Produk</label>
            <input type="file" @change="handleFileChange($event, 'edit')" accept="image/*" class="file-input" />
            <div v-if="editPreviewUrl" class="image-preview-container">
              <img :src="editPreviewUrl" class="image-preview" />
              <p class="preview-label">Preview Gambar Baru</p>
            </div>
            <div v-else-if="editingProduct.img" class="image-preview-container">
              <img :src="editingProduct.img" class="image-preview" />
              <p class="preview-label">Gambar Saat Ini</p>
            </div>
          </div>
          <div class="form-group">
            <label>Atau Update URL Gambar</label>
            <input type="text" v-model="editingProduct.img" />
          </div>

          <button type="submit" class="btn btn-primary w-full" :disabled="isUploading">
            {{ isUploading ? 'Mengunggah...' : 'Perbarui Produk' }}
          </button>
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
.status-select {
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  appearance: none;
  text-align: center;
}
.status-select.pending { background: #fffbeb; color: #d97706; }
.status-select.paid { background: #f0fdf4; color: #16a34a; }
.status-select.completed { background: #eff6ff; color: #2563eb; }
.status-select.cancelled { background: #fef2f2; color: #dc2626; }

.admin-form input:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.file-input {
  padding: 0.5rem 0 !important;
  border: none !important;
}

.image-preview-container {
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.5rem;
  background: #f8fafc;
  text-align: center;
}

.image-preview {
  max-width: 100%;
  max-height: 200px;
  border-radius: var(--radius-sm);
  display: block;
  margin: 0 auto 0.5rem;
  object-fit: contain;
}

.preview-label {
  font-size: 0.75rem;
  color: var(--text-light);
  font-weight: 600;
  text-transform: uppercase;
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
