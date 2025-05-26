const { auth } = require('../config/supabase');
const passwordUtils = require('../utils/password');

class Trabajador {
    constructor(data) {
        this.id = data.id;
        this.nombre = data.nombre;
        this.email = data.email;
        this.usuario_id = data.usuario_id;
        this.status = data.status;
        this.phone = data.phone;
        this.auth_id = data.auth_id;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    isActive() {
        return this.status === 'active';
    }

    static async findByEmail(email) {
        console.log('Buscando trabajador por email:', email);
        
        try {
            const { data, error } = await auth.supabaseAdmin
                .from('trabajadores')
                .select('*')
                .eq('email', email)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    console.log('No se encontró trabajador con el email:', email);
                    return null;
                }
                console.error('Error en la búsqueda:', error);
                throw error;
            }

            console.log('Trabajador encontrado:', data ? 'Sí' : 'No');
            return data ? new Trabajador(data) : null;
        } catch (error) {
            console.error('Error inesperado buscando trabajador:', error);
            throw error;
        }
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('trabajadores')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        return data ? new Trabajador(data) : null;
    }

    static async create(trabajadorData) {
        const { nombre, email, password, usuario_id, phone, status, auth_id } = trabajadorData;

        if (!nombre || !email || !password || !usuario_id || !phone || !auth_id) {
            throw new Error('Faltan campos requeridos: nombre, email, password, usuario_id, phone y auth_id son obligatorios');
        }

        // Hashear la contraseña
        const hashedPassword = await passwordUtils.hashPassword(password);

        const { data, error } = await auth.supabaseAdmin
            .from('trabajadores')
            .insert([{
                nombre,
                email,
                password: hashedPassword,
                usuario_id,
                phone,
                status: status || 'active',
                auth_id
            }])
            .select()
            .single();

        if (error) throw error;
        return new Trabajador(data);
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('trabajadores')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();

        if (error) throw error;
        Object.assign(this, new Trabajador(data));
        return this;
    }

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('trabajadores')
            .delete()
            .eq('id', this.id);

        if (error) throw error;
        return true;
    }

    async verifyPassword(password) {
        const { data, error } = await auth.supabaseAdmin
            .from('trabajadores')
            .select('password')
            .eq('id', this.id)
            .single();

        if (error) throw error;
        return passwordUtils.verifyPassword(password, data.password);
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('trabajadores')
            .select(`
                *,
                clients_count:clientes(count)
            `)
            .order('nombre');

        if (error) throw error;
        
        // Transformar el resultado para que clients_count sea un número
        const trabajadoresConConteo = data.map(trabajador => ({
            ...new Trabajador(trabajador),
            clients_count: parseInt(trabajador.clients_count?.[0]?.count || 0)
        }));

        return trabajadoresConConteo;
    }
}

module.exports = Trabajador; 