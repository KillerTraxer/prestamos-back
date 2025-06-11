const { auth } = require('../config/supabase');

class User {
    constructor(data) {
        this.id = data.id;
        this.email = data.email;
        this.nombre = data.nombre;
        this.role = data.role;
        this.auth_id = data.auth_id;
        this.password = data.password;
        this.status = data.status;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    isActive() {
        return this.status === 'active';
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select('*');
        if (error) throw error;
        return data.map(user => new User(user));
    }

    static async findAllWorkers() {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('role', 'trabajador');
        if (error) throw error;
        return data.map(user => new User(user));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data ? new User(data) : null;
    }

    static async findByEmail(email) {
        console.log('User.findByEmail: Buscando usuario admin por email:', email);

        try {
            const { data, error } = await auth.supabaseAdmin
                .from('usuarios')
                .select('*')
                .eq('email', email)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.log('User.findByEmail: No se encontró usuario admin con el email:', email);
                    return null;
                }
                console.error('User.findByEmail: Error en la búsqueda:', error);
                throw error;
            }

            if (!data) {
                console.log('No se encontró usuario admin con el email (data null):', email);
                return null;
            }

            console.log('Usuario admin encontrado');
            return new User(data);
        } catch (error) {
            console.error('User.findByEmail: Error inesperado:', error);
            throw error;
        }
    }

    static async findByAuthId(authId) {
        console.log('User.findByAuthId: Buscando usuario admin por auth_id:', authId);
        
        try {
            const { data, error } = await auth.supabaseAdmin
                .from('usuarios')
                .select('*')
                .eq('auth_id', authId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.log('User.findByAuthId: No se encontró usuario admin con auth_id:', authId);
                    return null;
                }
                console.error('User.findByAuthId: Error en la búsqueda:', error);
                throw error;
            }

            if (!data) {
                console.log('User.findByAuthId: No data returned for auth_id:', authId);
                return null;
            }

            console.log('User.findByAuthId: Usuario admin encontrado:', {
                id: data.id,
                email: data.email,
                nombre: data.nombre,
                status: data.status
            });
            return new User(data);
        } catch (error) {
            console.error('User.findByAuthId: Error inesperado:', error);
            throw error;
        }
    }

    static async create(userData) {
        console.log('Creando nuevo usuario:', userData.email);
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .insert([userData])
            .select()
            .single();

        if (error) {
            console.error('Error creando usuario:', error);
            throw error;
        }

        console.log('Usuario creado exitosamente');
        return new User(data);
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('usuarios')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, data);
        return this;
    }

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('usuarios')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    // Métodos específicos para trabajadores
    async getClients() {
        if (this.role !== 'trabajador') {
            throw new Error('Solo los trabajadores pueden acceder a la lista de clientes');
        }
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select('*')
            .eq('trabajador_id', this.id);
        if (error) throw error;
        return data;
    }
}

module.exports = User; 