const { auth } = require('../config/supabase');
const { calcularPagosDiarios } = require('../utils/calculations');

class Client {
    constructor(data) {
        this.id = data.id;
        this.nombre = data.nombre;
        this.telefono = data.telefono;
        this.direccion = data.direccion;
        this.ocupacion = data.ocupacion;
        this.trabajador_id = data.trabajador_id;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async findAll() {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select(`
                *,
                trabajador:trabajadores(
                    id,
                    nombre,
                    email
                )
            `);
        if (error) throw error;
        return data.map(client => new Client(client));
    }

    static async findById(id) {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select(`
                *,
                trabajador:trabajadores(
                    id,
                    nombre,
                    email
                )
            `)
            .eq('id', id)
            .single();
        
        if (error) {
            throw error;
        }
        return new Client(data);
    }

    static async findByWorkerId(trabajadorId) {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .select(`
                *,
                trabajador:trabajadores(
                    id,
                    nombre,
                    email
                )
            `)
            .eq('trabajador_id', trabajadorId);
        if (error) throw error;
        return data.map(client => new Client(client));
    }

    static async create(clientData) {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .insert([clientData])
            .select()
            .single();
        if (error) throw error;
        return new Client(data);
    }

    async update(updates) {
        const { data, error } = await auth.supabaseAdmin
            .from('clientes')
            .update(updates)
            .eq('id', this.id)
            .select()
            .single();
        if (error) throw error;
        Object.assign(this, new Client(data));
        return this;
    }

    async delete() {
        const { error } = await auth.supabaseAdmin
            .from('clientes')
            .delete()
            .eq('id', this.id);
        if (error) throw error;
        return true;
    }

    async getPayments() {
        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .select('*')
            .eq('cliente_id', this.id);
        if (error) throw error;
        return data;
    }

    async getFines() {
        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .select('*')
            .eq('cliente_id', this.id);
        if (error) throw error;
        return data;
    }

    async addPayment(monto, fecha) {
        const nuevoMontoActual = this.monto_actual - parseFloat(monto);
        const estado = nuevoMontoActual <= 0 ? 'completado' : this.estado;

        const { data, error } = await auth.supabaseAdmin
            .from('abonos')
            .insert([{
                cliente_id: this.id,
                monto: parseFloat(monto),
                fecha,
                estado
            }])
            .select()
            .single();
        if (error) throw error;

        await this.update({
            monto_actual: nuevoMontoActual,
            estado
        });

        return data;
    }

    async addFine(fecha) {
        const montoMulta = 20; // Multa fija

        const { data, error } = await auth.supabaseAdmin
            .from('multas')
            .insert([{
                cliente_id: this.id,
                fecha,
                monto: montoMulta,
                estado: 'pendiente'
            }])
            .select()
            .single();
        if (error) throw error;

        const multas = await this.getFines();
        const totalMultasHoy = multas.filter(m => 
            new Date(m.fecha).toDateString() === new Date().toDateString()
        ).length;

        const totalMultasSemanales = multas.filter(m => {
            const multaDate = new Date(m.fecha);
            const today = new Date();
            const diffTime = Math.abs(today - multaDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        }).length;

        const nuevoMontoActual = this.monto_actual + montoMulta;
        let nuevaFechaTermino = new Date(this.fecha_termino);

        if (totalMultasHoy % 3 === 0) {
            nuevaFechaTermino.setDate(nuevaFechaTermino.getDate() + 1);
        }

        await this.update({
            monto_actual: nuevoMontoActual,
            fecha_termino: nuevaFechaTermino.toISOString().split('T')[0],
            total_multas_hoy: totalMultasHoy,
            total_multas_semanales: totalMultasSemanales
        });

        return data;
    }
}

module.exports = Client; 